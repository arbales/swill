# frozen_string_literal: true

require "swill/core/sig"

# The sig *authoring* surface: `extend Swill::Sig` into a command/query
# module, declare `§ name: String`, and method_added binds it to the next
# definition. Authoring only ever runs on the server (MRI) — the client
# rebuilds signatures from the plain-data manifest — so this file is required
# by server code and specs, not by swill/core.
module Swill
  module Sig
    def self.extended(base)
      base.instance_variable_set(:@__swill_pending_sig__, nil)
      base.instance_variable_set(:@__swill_signatures__, {})
    end

    def params(**types)
      @__swill_pending_sig__ = Signature.new(resolve_params(types))
    end

    def §(**types)
      params(**types)
    end

    # Binds pending params to the method defined immediately after them.
    def method_added(name)
      if @__swill_pending_sig__
        @__swill_signatures__[name] = @__swill_pending_sig__
        @__swill_pending_sig__ = nil
      end
      super
    end

    def signature_for(name)
      @__swill_signatures__[name]
    end

    def signatures
      @__swill_signatures__.dup
    end

    # Plain-data manifest of every sig in this module, for shipping to the
    # client. { method_name => signature_descriptor }.
    def sig_manifest
      @__swill_signatures__.each_with_object({}) do |(name, signature), out|
        out[name] = signature.descriptor
      end
    end

    private

    def resolve_params(types)
      types.each_with_object({}) do |(name, token), out|
        out[name] = Type.of(token)
      end
    end
  end
end
