# frozen_string_literal: true

# Server declarations use Sorbet's type vocabulary even when Sorbet is not
# loaded. Real Sorbet wins when an application requires it first.
unless defined?(T)
  Object.const_set(:T, Module.new)
  T.const_set(:Sig, Swill::Sig)
  T.const_set(:Boolean, Swill::Distant::Type.new("primitive", name: "Boolean"))
  T.const_set(:Array, Swill::Distant::Generic.new("array"))
  T.define_singleton_method(:nilable) do |type|
    Swill::Distant::Type.new("optional", members: [Swill::Distant::Types.normalize(type)])
  end
  T.define_singleton_method(:any) do |*types|
    Swill::Distant::Type.new("union", members: types.map { |type| Swill::Distant::Types.normalize(type) })
  end
  T.define_singleton_method(:untyped) { Swill::Distant::Type.new("dynamic") }
end
