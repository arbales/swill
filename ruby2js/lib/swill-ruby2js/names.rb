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

      # Ruby members in JavaScript spelling: snake_case becomes camelCase
      # with these acronyms upper-cased; a predicate gains an is prefix unless
      # it is phrased as a verb (acceptsFirstResponder, rowsAreViews), and a
      # bang is dropped. A name starting with an underscore is JavaScript's
      # own (an expando such as __swill_view__) and is left alone.
      ACRONYMS = %w[dom url json html].freeze
      PREDICATE_VERBS = %w[accepts allow allows can confirm contains has holds includes matches needs requires should supports].freeze
      PREDICATE_LINKS = %w[are is has].freeze

      def member(name)
        text = name.to_s
        # Only a Ruby-shaped name is respelled; anything else (a leading
        # underscore, a double underscore) is left as written.
        return text unless text.match?(/\A[a-z][a-z0-9]*(?:_[a-z0-9]+)*[?!=]?\z/)
        suffix = text[/[?!=]\z/]
        words = text.delete_suffix(suffix.to_s).split("_")
        camel = words.first + words.drop(1).map { |word| ACRONYMS.include?(word) ? word.upcase : "#{word[0].upcase}#{word[1..]}" }.join
        if suffix == "?" && !PREDICATE_VERBS.include?(words.first) && (words.drop(1) & PREDICATE_LINKS).empty?
          camel = "is#{camel[0].upcase}#{camel[1..]}"
        end
        suffix == "=" ? "#{camel}=" : camel
      end
    end
  end
end
