# frozen_string_literal: true

# Server declarations use Sorbet's type vocabulary even when Sorbet is not
# loaded. Real Sorbet wins when an application requires it first.
unless defined?(T)
  Object.const_set(:T, Module.new)
  T.const_set(:Sig, Swill::Sig)
  T.const_set(:Boolean, Swill::Data::Type.new("primitive", name: "Boolean"))
  T.const_set(:Array, Swill::Data::Generic.new("array"))
  T.define_singleton_method(:nilable) do |type|
    Swill::Data::Type.new("optional", members: [Swill::Data::Types.normalize(type)])
  end
  T.define_singleton_method(:any) do |*types|
    Swill::Data::Type.new("union", members: types.map { |type| Swill::Data::Types.normalize(type) })
  end
  T.define_singleton_method(:untyped) { Swill::Data::Type.new("dynamic") }
end
