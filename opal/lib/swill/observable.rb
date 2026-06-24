# frozen_string_literal: true

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
  # notification, ad-hoc observers, and computed properties whose dependencies
  # are discovered automatically. Mixed into Controller (and, later, View and
  # model value objects).
  #
  #   class Person
  #     include Swill::Observable
  #     property :first
  #     property :last
  #     computed :full_name do
  #       "#{first} #{last}"
  #     end
  #   end
  #
  # The do/end form is canonical. A `{ }` block cannot follow a paren-less call
  # with an argument in Ruby, so `computed :full_name { ... }` will not parse;
  # use do/end, or parenthesize as `computed(:full_name) { ... }`.
  #
  # Reading +full_name+ records reads of +first+ and +last+; writing either one
  # invalidates the cache and, if anything observes +full_name+, recomputes and
  # notifies. No dependency array.
  #
  # property vs attr_accessor: a `property` is an *observable* accessor — the
  # reactive surface that bindings and computeds depend on. Plain
  # `attr_accessor` (and attr_reader/attr_writer) stay available for ordinary
  # non-reactive state. To make a hand-written accessor reactive, call
  # `notify_change(name, previous, value)` in its setter. Declaring the same
  # name both as a property/computed and as a plain accessor warns, because the
  # plain accessor silently bypasses notification.
  module Observable
    def self.included(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      def property(name, default: nil)
        name = name.to_sym
        warn_reactive_overlap(name) if observable_plain_accessors.key?(name)
        observable_properties[name] = { default: default }

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

        define_method("#{name}=") do |value|
          previous = resolve.call(self)
          return value if previous == value

          property_store[name] = value
          notify_change(name, previous, value)
          value
        end
      end

      # A read-only derived property. Dependencies are discovered by running the
      # block once and recording every property it reads; the result is cached
      # until one of those dependencies changes.
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

      def observable_properties
        @observable_properties ||= {}
      end

      def observable_computeds
        @observable_computeds ||= {}
      end

      def observable_plain_accessors
        @observable_plain_accessors ||= {}
      end

      def computed_block(name)
        observable_computeds[name.to_sym]
      end

      # Plain attr_* accessors remain available for non-reactive state. We wrap
      # them only to detect a name that is also a reactive property/computed: a
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

      # Sequel-style inherited configuration: copy the declaration registries
      # into the subclass once, explicitly, rather than walking metadata up the
      # ancestry on every lookup.
      def inherited(subclass)
        super
        subclass.instance_variable_set(:@observable_properties, observable_properties.dup)
        subclass.instance_variable_set(:@observable_computeds, observable_computeds.dup)
        subclass.instance_variable_set(:@observable_plain_accessors, observable_plain_accessors.dup)
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
             "property/computed and a plain accessor; the plain accessor does " \
             "not notify observers. Use `property` for reactive state.")
      end
    end

    # Subscribe to changes of +name+. Returns a lambda that unsubscribes.
    #
    # Observing a computed forces it to compute now if it hasn't already, so its
    # dependency subscriptions exist; otherwise a change to a dependency that
    # happens before the first read would never reach this observer.
    def observe(name, &observer)
      name = name.to_sym
      ensure_computed(name)
      observers_for(name) << observer
      -> { observers_for(name).delete(observer) }
    end

    def notify_change(name, previous, value)
      name = name.to_sym
      callback = "#{name}_did_change"
      public_send(callback, previous, value) if respond_to?(callback)
      observers_for(name).dup.each { |observer| observer.call(value) }
    end

    private

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

    # If +name+ is a computed that hasn't been computed yet, compute it so its
    # dependency subscriptions are established. No-op for plain properties.
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
        object.observe(dependency) { invalidate_computed(name) }
      end
      computed_store[name] = { value: value, valid: true }
      value
    end

    # A dependency changed. Drop the cache. If anything is watching this
    # computed (a binding, or another computed that depends on it), recompute
    # eagerly and push the change so observers stay live; otherwise stay lazy
    # and let the next read recompute.
    def invalidate_computed(name)
      slot = computed_store[name]
      return unless slot && slot[:valid]

      previous = slot[:value]
      slot[:valid] = false

      return if observers_for(name).empty?

      value = recompute_computed(name)
      notify_change(name, previous, value) unless previous == value
    end
  end
end
