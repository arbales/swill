# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    class CompileError < StandardError; end

    # Intrinsics introduced by built-in filters must not capture source classes.
    JS_INTRINSICS = %w[Object Array String Number Math JSON Error Promise MutationObserver URLSearchParams].freeze

    # Encoded names shared by the compiler, its metadata, and generated code.
    module Names
      module_function

      def identifier(name)
        # Ordinary names stay ordinary; namespaces use __. Escape source
        # underscores first so A::B and A__B remain distinct. The single
        # underscore in Ruby_Runtime cannot occur in an encoded source name.
        return "Ruby_#{name}" if (%w[Runtime Superclass] + JS_INTRINSICS).include?(name)
        name.split("::").map { |part| part.gsub("_", "_u") }.join("__")
      end

      def member(name)
        name.to_s.gsub("?", "_predicate").gsub("!", "_bang")
      end
    end
  end
end
