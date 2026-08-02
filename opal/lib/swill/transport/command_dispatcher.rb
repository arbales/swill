# frozen_string_literal: true

module Swill
  # Typed client command boundary. A trusted server manifest supplies the
  # signatures; every call is coerced locally before crossing the wire.
  class CommandDispatcher
    def initialize(endpoint:, manifest:, wire: Wire)
      @endpoint = endpoint.to_s
      @wire = wire
      @signatures = manifest.each_with_object({}) do |(name, descriptor), signatures|
        signatures[name.to_sym] = descriptor.is_a?(Sig::Signature) ? descriptor : Sig::Signature.from_descriptor(descriptor)
      end
    end

    def call(name, params: {}, context: nil)
      name = name.to_sym
      signature = @signatures[name]
      raise Sig::Error, "unknown command: #{name}" unless signature

      payload = { command: name.to_s, params: signature.encode(signature.coerce(params)) }
      payload[:context] = context unless context.nil?
      @wire.request_json("POST", @endpoint, body: payload)
    end
  end
end
