# typed: true
# frozen_string_literal: true

module Swill
  # NSValueTransformer for markup: transform="number" on a bound element
  # formats the value for display and parses the control's text back into
  # the model. Transformers are registered by name. string, number, and
  # boolean are built in; an application registers its own before its
  # views awaken.
  class ValueTransformer < Swill::Object
    extend T::Sig

    sig { params(name: String, transformer: ValueTransformer).returns(ValueTransformer) }
    def self.register(name, transformer)
      ValueTransformer.registry[name] = transformer
      transformer
    end

    sig { params(name: String).returns(T.nilable(ValueTransformer)) }
    def self.named(name)
      ValueTransformer.registry[name]
    end

    sig { returns(T::Hash[String, ValueTransformer]) }
    def self.registry
      known = @registry
      return known if known
      @registry = T.let({
        "string" => ValueTransformer.new,
        "number" => NumberTransformer.new,
        "boolean" => BooleanTransformer.new
      }, T.nilable(T::Hash[String, ValueTransformer]))
      T.must(@registry)
    end

    # The text shown for a value; nil shows as nothing.
    sig { params(value: T.untyped).returns(String) }
    def format(value)
      value == nil ? "" : "#{value}"
    end

    # The value a control's text stands for.
    sig { params(text: String).returns(T.untyped) }
    def parse(text)
      text
    end
  end

  # A number, or nil for blank text, so an emptied field clears the value.
  class NumberTransformer < ValueTransformer
    sig { params(text: String).returns(T.untyped) }
    def parse(text)
      stripped = text.strip
      stripped.empty? ? nil : stripped.to_f
    end
  end

  class BooleanTransformer < ValueTransformer
    sig { params(value: T.untyped).returns(String) }
    def format(value)
      value ? "true" : "false"
    end

    sig { params(text: String).returns(T.untyped) }
    def parse(text)
      text == "true" || text == "1" || text == "on"
    end
  end
end
