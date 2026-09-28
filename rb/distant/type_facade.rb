# frozen_string_literal: true

# The type facade: when no `T` is defined — the application did not require
# `sorbet-runtime` before `swill/server` — this defines the subset of Sorbet's
# vocabulary the protocol understands (`T::Sig`, `T::Boolean`, `T::Array`,
# `T.nilable`, `T.any`, `T.untyped`), each producing a `Swill::Distant::Type`
# directly. Server declarations are then written the same way with or without
# Sorbet, and Sorbet's own `T` is used whenever it is loaded first.
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
