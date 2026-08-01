# frozen_string_literal: true

module Swill
  module Model
    class Store
    def initialize
      @instances = {}
    end

    def get(id)
      @instances[id]
    end

    def include?(id)
      @instances.key?(id)
    end

    def put(instance)
      raise ArgumentError, "Model::Store#put requires an id" if instance.id.nil?

      existing = get(instance.id)
      if existing && !existing.equal?(instance)
        existing.apply_attributes(instance.collect_attributes)
        existing
      else
        @instances[instance.id] = instance
      end
    end

    def remove(id)
      @instances.delete(id)
    end

    def clear
      @instances.clear
    end

    def values
      @instances.values
    end
    end
  end
end
