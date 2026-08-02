# frozen_string_literal: true

# TODO: I think we can streamline and simplify this.

module Swill
  # Tracks the computation currently on the stack so that property reads can
  # register themselves as its dependencies. Opal compiles to single-threaded
  # JavaScript, so a plain module-level stack is sufficient — there is no
  # Thread.current to contend with, which is exactly the affordance
  # reactivity-approach.md calls out.
  module Computation
    @stack = []

    class << self
      # Run +block+ while collecting every (object, property) pair it reads.
      # Returns [dependencies, value].
      def capture
        frame = []
        @stack.push(frame)
        value = yield
        [frame, value]
      ensure
        @stack.pop
      end

      # Record a read of +name+ on +object+ against the active computation, if
      # any. This single call inside the property getter is the whole trick.
      def record(object, name)
        frame = @stack.last
        return unless frame

        pair = [object, name]
        frame << pair unless frame.include?(pair)
      end

      def active?
        !@stack.empty?
      end
    end
  end

  # Observable state for any Swill object: declared properties with change
  # notification, ad-hoc observers, and block-backed properties whose
  # dependencies are discovered automatically. Mixed into Controller (and,
  # later, View and model value objects).
  #
  #   class Person
  #     include Swill::Observable
  #     property :first
  #     property :last
  #     property :full_name do
  #       "#{first} #{last}"
  #     end
  #   end
  #
  # The do/end form is canonical. A `{ }` block cannot follow a paren-less call
  # with an argument in Ruby, so `property :full_name { ... }` will not parse;
  # use do/end, or parenthesize as `property(:full_name) { ... }`.
  #
  # Reading +full_name+ records reads of +first+ and +last+; writing either one
  # invalidates the cache and, if anything observes +full_name+, recomputes and
  # notifies. No dependency array.
  #
  # property vs attr_accessor: a `property` is an *observable* accessor — the
  # reactive surface that bindings and derived properties depend on. Plain
  # `attr_accessor` (and attr_reader/attr_writer) stay available for ordinary
  # non-reactive state. To make a hand-written accessor reactive, call
  # `notify_change(name, previous, value)` in its setter. Declaring the same
  # name both as a reactive property and as a plain accessor warns, because the
  # plain accessor silently bypasses notification.
  module Observable
    def self.included(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      extend Declarations

      inheritable_registry :observable_properties
      inheritable_registry :observable_computeds
      inheritable_registry :observable_plain_accessors

      def property(name, default: UNSET, coerce: nil, &block)
        if block
          raise ArgumentError, "derived property cannot also have a default" unless default.equal?(UNSET)
          raise ArgumentError, "derived property cannot also have a coerce" if coerce

          return computed(name, &block)
        end

        name = name.to_sym
        if name.to_s.end_with?("?")
          raise ArgumentError, "predicate properties must be block-backed: property :#{name} do ..."
        end

        default = nil if default.equal?(UNSET)
        warn_reactive_overlap(name) if observable_plain_accessors.key?(name)
        observable_properties[name] = { default: default, coerce: coerce }

        # Resolve the stored value, materializing the default on first touch.
        # Used by both the getter (which also records a dependency) and the
        # setter (which must read the previous value without recording one).
        resolve = lambda do |instance|
          store = instance.__send__(:property_store)
          unless store.key?(name)
            store[name] = default.respond_to?(:call) ? instance.instance_exec(&default) : default
          end
          store[name]
        end

        define_method(name) do
          Computation.record(self, name)
          resolve.call(self)
        end

        # The one canonical mutation path. Declaration-level coerce runs
        # first, then the instance-side hooks that concerns override
        # (validation via coerce_property_value, dirty marking via
        # property_will_change) — nothing redefines this setter.
        define_method("#{name}=") do |value|
          previous = resolve.call(self)
          value = instance_exec(value, &coerce) if coerce
          value = coerce_property_value(name, value, previous)
          return value if previous == value

          property_will_change(name, previous, value)
          property_store[name] = value
          notify_change(name, previous, value)
          value
        end
      end

      # Implementation of block-backed property declarations. Internal —
      # `property :name do ... end` is the public spelling.
      def computed(name, &block)
        name = name.to_sym
        warn_reactive_overlap(name) if observable_plain_accessors.key?(name)
        observable_computeds[name] = block

        define_method(name) do
          Computation.record(self, name)
          slot = computed_store[name]
          return slot[:value] if slot && slot[:valid]

          recompute_computed(name)
        end
      end
      private :computed

      def computed_block(name)
        observable_computeds[name.to_sym]
      end

      # Plain attr_* accessors remain available for non-reactive state. We wrap
      # them only to detect a name that is also a reactive property: a
      # plain accessor bypasses change notification, so that overlap silently
      # breaks observation and earns a warning. (To make a hand-written
      # accessor reactive, call notify_change in its setter — that is the
      # supported opt-in, no wrapping needed.)
      def attr_reader(*names)
        register_plain_accessors(names)
        super
      end

      def attr_writer(*names)
        register_plain_accessors(names)
        super
      end

      def attr_accessor(*names)
        register_plain_accessors(names)
        super
      end

      private

      def register_plain_accessors(names)
        names.each do |name|
          name = name.to_sym
          observable_plain_accessors[name] = true
          warn_reactive_overlap(name) if observable_properties.key?(name) || observable_computeds.key?(name)
        end
      end

      def warn_reactive_overlap(name)
        warn("[Swill] #{self}: :#{name} is declared both as a reactive " \
             "property and a plain accessor; the plain accessor does " \
             "not notify observers. Use `property` for reactive state.")
      end
    end

    # Subscribe to changes of +name+. Returns a lambda that unsubscribes.
    #
    # Observing a derived property forces it to compute now if it hasn't
    # already, so its dependency subscriptions exist; otherwise a dependency
    # change before the first read would never reach this observer.
    def observe(name, &observer)
      name = name.to_sym
      ensure_computed(name)
      observers_for(name) << observer
      -> { observers_for(name).delete(observer) }
    end

    # Internal: a derived property's dependency subscription. Dependents run
    # before the did-change hook and public observers (see notify_change), so
    # a hook that reads a derived property sees a fresh value, never the
    # pre-change cache.
    def observe_dependent(name, &observer)
      name = name.to_sym
      ensure_computed(name)
      dependents_for(name) << observer
      -> { dependents_for(name).delete(observer) }
    end

    # Observable objects are often used as lightweight editing values. Ruby's
    # default dup is shallow, so explicitly detach reactive storage and never
    # copy subscriptions or computed dependency disposers into the clone.
    def initialize_dup(other)
      super
      @properties = @properties&.dup
      @observers = {}
      @dependent_observers = {}
      @computed = {}
      @computed_disposers = {}
    end

    def notify_change(name, previous, value)
      name = name.to_sym
      dependents_for(name).dup.each { |dependent| dependent.call(value) }
      callback = "#{name}_did_change"
      public_send(callback, previous, value) if respond_to?(callback)
      observers_for(name).dup.each { |observer| observer.call(value) }
    end

    private

    # Setter hooks, called for every declared property. Concerns override
    # these (and call super) instead of redefining the generated setter:
    # coerce_property_value transforms the incoming value before the equality
    # check; property_will_change runs after it, just before storage.
    def coerce_property_value(_name, value, _previous)
      value
    end

    def property_will_change(_name, _previous, _value); end

    def property_store
      @properties ||= {}
    end

    def computed_store
      @computed ||= {}
    end

    def computed_disposers
      @computed_disposers ||= {}
    end

    def observers_for(name)
      (@observers ||= {})[name.to_sym] ||= []
    end

    def dependents_for(name)
      (@dependent_observers ||= {})[name.to_sym] ||= []
    end

    # If +name+ is a derived property that has not run yet, compute it so its
    # dependency subscriptions are established. No-op for stored properties.
    def ensure_computed(name)
      return unless self.class.respond_to?(:computed_block) && self.class.computed_block(name)

      slot = computed_store[name]
      recompute_computed(name) unless slot && slot[:valid]
    end

    def recompute_computed(name)
      computed_disposers[name]&.each(&:call)

      block = self.class.computed_block(name)
      deps, value = Computation.capture { instance_exec(&block) }

      computed_disposers[name] = deps.map do |object, dependency|
        object.observe_dependent(dependency) { invalidate_computed(name) }
      end
      computed_store[name] = { value: value, valid: true }
      value
    end

    # A dependency changed. Drop the cache and propagate the invalidation to
    # derived properties built on this one. If anything public is watching (a
    # binding, or a did-change hook via notify), recompute eagerly and push
    # the change so observers stay live; otherwise stay lazy and let the next
    # read recompute.
    def invalidate_computed(name)
      slot = computed_store[name]
      return unless slot && slot[:valid]

      previous = slot[:value]
      slot[:valid] = false

      dependents_for(name).dup.each { |dependent| dependent.call(nil) }

      return if observers_for(name).empty?

      value = recompute_computed(name)
      notify_change(name, previous, value) unless previous == value
    end
  end
end
