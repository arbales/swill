# typed: false
# frozen_string_literal: true

# Observable state and computed dependency tracking, on MRI. The mirror of
# runtime/properties.mjs, function for function: mutations always follow
# coerce, compare, will-change, store, notify, and reads follow record,
# will-access, resolve.
module Swill
  module Runtime
    CAPTURES = []
    DECLARATION_CACHE = {}
    private_constant :CAPTURES, :DECLARATION_CACHE

    class << self
      # The declaration site of the macro call under way: the nearest frame
      # outside this host. A base.property inside an included hook is
      # attributed to the hook, which is where it is written.
      def declaration_origin
        frame = caller_locations(1).find { |location| !host_file?(location.path) }
        frame ? [frame.path, frame.lineno] : nil
      end

      def host_file?(path)
        (@host_files ||= Dir[File.join(__dir__, "*.rb")] + [File.expand_path("../runtime.rb", __dir__)]).include?(path)
      end

      def declarations_changed!
        DECLARATION_CACHE.clear
      end

      # Every descriptor of a kind visible on a class, superclass first. The
      # browser copies the parent's map once at installation; here the
      # ancestry is walked and the answer memoized until a class declares.
      def declarations(klass, kind)
        DECLARATION_CACHE[[klass, kind]] ||= begin
          ivar = :"@swill_#{kind}"
          klass.ancestors.reverse_each.with_object({}) do |ancestor, result|
            own = ancestor.instance_variable_get(ivar) if ancestor.instance_variable_defined?(ivar)
            result.merge!(own) if own.is_a?(::Hash)
          end
        end
      end

      def property_descriptor(object, name)
        declarations(object.class, "properties")[name.to_s]
      end

      # ---- state ----

      def state(object)
        current = object.instance_variable_get(:@__swill_state__)
        return current if current
        current = {values: {}, computed: {}, observers: {}, dependents: {}, retained: []}
        object.instance_variable_set(:@__swill_state__, current)
        # Hooked computed properties stay current.
        declarations(object.class, "properties").each_value do |descriptor|
          computed_value(object, descriptor) if descriptor["computed"] && hooked?(object, descriptor["name"])
        end
        current
      end

      def hooked?(object, name)
        object.respond_to?("#{name}_did_change")
      end

      def record(object, name)
        frame = CAPTURES.last
        return unless frame
        (frame[object] ||= []) << name unless frame[object]&.include?(name)
      end

      def listeners(object, name, kind)
        state(object)[kind][name] ||= []
      end

      def subscribe(object, name, callback, kind)
        name = name.to_s
        descriptor = property_descriptor(object, name)
        raise "Unknown observable property: #{name}" unless descriptor
        computed_value(object, descriptor) if descriptor["computed"]
        set = listeners(object, name, kind)
        set << callback
        -> { set.delete(callback) }
      end

      # ---- reads ----

      def stored_value(object, descriptor)
        values = state(object)[:values]
        name = descriptor["name"]
        values.fetch(name) { values[name] = descriptor["default_value"].call }
      end

      def computed_value(object, descriptor)
        name = descriptor["name"]
        slot = state(object)[:computed][name] ||= {valid: false, running: false, value: nil, disposers: []}
        return slot[:value] if slot[:valid]
        raise "Computed cycle: #{name}" if slot[:running]

        slot[:disposers].slice!(0..).each(&:call)
        frame = {}
        slot[:running] = true
        CAPTURES.push(frame)
        begin
          slot[:value] = object.instance_exec(&descriptor["compute"])
          slot[:valid] = true
        ensure
          CAPTURES.pop
          slot[:running] = false
        end

        frame.each do |dependency, names|
          names.each do |dependency_name|
            slot[:disposers] << subscribe(dependency, dependency_name, -> { invalidate(object, descriptor) }, :dependents)
          end
        end
        slot[:value]
      end

      def invalidate(object, descriptor)
        name = descriptor["name"]
        slot = state(object)[:computed][name]
        return unless slot && slot[:valid]
        previous = slot[:value]
        slot[:valid] = false
        listeners(object, name, :dependents).dup.each(&:call)
        # Recompute only when a listener needs the result.
        return if listeners(object, name, :observers).empty? && !hooked?(object, name)
        value = computed_value(object, descriptor)
        notify(object, name, previous, value) unless previous == value
      end

      # ---- writes ----

      def notify(object, name, previous, value)
        listeners(object, name, :dependents).dup.each(&:call)
        hook = "#{name}_did_change"
        object.public_send(hook, previous, value) if object.respond_to?(hook)
        listeners(object, name, :observers).dup.each { |callback| deliver(callback, value, previous) }
      end

      # A JavaScript observer ignores an argument it did not declare; a Ruby
      # lambda refuses it, so the arity decides.
      def deliver(callback, value, previous)
        callback.arity == 1 || callback.arity == -1 ? callback.call(value) : callback.call(value, previous)
      end

      def write_property(object, descriptor, value)
        name = descriptor["name"]
        previous = stored_value(object, descriptor)
        value = object.coerce_property_value(name, value, previous)
        return value if previous == value

        object.property_will_change(name, previous, value)
        state(object)[:values][name] = value
        notify(object, name, previous, value)
        value
      end

      # ---- the observation surface ----

      def observe(object, name, callback)
        subscribe(object, name, callback, :observers)
      end

      # Cocoa's retain: the object claims the disposer and is responsible for
      # letting it go, which it does when it deallocs.
      def retain(object, disposer)
        state(object)[:retained] << disposer
        disposer
      end

      # Cocoa's release: give up a claim before the object goes away.
      def release(object, disposer)
        current = object.instance_variable_get(:@__swill_state__)
        current[:retained].delete(disposer) if current
        disposer.call
      end

      # End of life: release everything retained, then leave the observation
      # graph.
      def dealloc(object)
        current = object.instance_variable_get(:@__swill_state__)
        current[:retained].slice!(0..).each(&:call) if current
        disconnect(object)
      end

      # Leave the observation graph in both directions. Stored values are
      # kept, so the object remains usable.
      def disconnect(object)
        current = object.instance_variable_get(:@__swill_state__)
        return unless current
        dependents = current[:dependents].values.flatten.dup
        current[:computed].each_value { |slot| slot[:disposers].slice!(0..).each(&:call) }
        current[:computed].clear
        current[:observers].clear
        current[:dependents].clear
        dependents.each(&:call)
      end
    end
  end
end
