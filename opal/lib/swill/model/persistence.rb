# frozen_string_literal: true

module Swill
  module Model
    # Promise-returning instance commands over an injectable wire boundary.
    # Endpoints are explicit; no route convention is imposed on model names.
    module Persistence
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        extend Declarations

        class_setting(:endpoint, &:to_s)
      end

      def save(wire: Wire)
        validate_for_persistence!
        url = persistence_endpoint!
        creating = id.nil?
        return wire.resolved(self) if !creating && !dirty?

        method = creating ? "POST" : "PATCH"
        url = Wire.resource_url(url, id) unless creating
        payload = serialize(dirty_only: !creating)

        wire.request_json(method, url, body: payload).then do |response|
          persisted = self.class.parse_one(response)
          raise RuntimeError, "#{method} #{url} returned no model" unless persisted

          self.id = persisted.id
          apply_attributes(persisted)
          mark_clean!
          self.class.remove(persisted.id) if creating && !persisted.equal?(self)
          self.class.put(self)
          self
        end
      end

      def reload(wire: Wire)
        raise ArgumentError, "reload requires an id" if id.nil?

        url = Wire.resource_url(persistence_endpoint!, id)
        wire.request_json("GET", url).then do |response|
          refreshed = self.class.parse_one(response)
          raise RuntimeError, "GET #{url} returned no model" unless refreshed

          apply_attributes(refreshed)
          mark_clean!
          self
        end
      end

      def delete(wire: Wire)
        return wire.resolved(self) if id.nil?

        identifier = id
        url = Wire.resource_url(persistence_endpoint!, identifier)
        wire.request_json("DELETE", url).then do
          self.class.remove(identifier)
          self
        end
      end

      private

      def persistence_endpoint!
        endpoint = self.class.endpoint
        raise ArgumentError, "#{self.class} has no endpoint" if endpoint.nil? || endpoint.empty?

        endpoint
      end

      def validate_for_persistence!
        result = validate
        raise result if result.is_a?(Exception)
      end
    end
  end
end
