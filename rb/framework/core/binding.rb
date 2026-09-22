# typed: true
# frozen_string_literal: true

module Swill
  # One binding, established between a destination and a key path on an object.
  #
  # This is Cocoa's bind:toObject:withKeyPath:options:. A markup binding and a
  # binding made in Ruby are the same thing established two ways: the markup
  # side reads the attributes and then arrives here, as Interface Builder does.
  #
  # The binding owns the value pipeline — transformer, null placeholder,
  # direction — because those are options of the binding rather than facts
  # about the destination, which only reads, writes, and reports edits.
  #
  # A binding is not a Swill::Object: it holds no observable state, and one
  # exists per bound element, so the observation graph is the wrong place for it.
  class Binding
    extend T::Sig

    # Establishes a binding and answers the disposer that releases it.
    #
    # The destination is (destination, target, key); the source is (object,
    # key_path); the rest are the options. placeholder is what the destination
    # is given when the path has no value, and one_way refuses the reverse
    # channel even where the destination offers one. Writability is checked once, here,
    # rather than discovered when somebody types into a field bound to a
    # computed property.
    #
    # Positional rather than keyword arguments on purpose: a list re-wires every
    # binding in every row on each render, and a keyword carrier is an
    # allocation per call.
    sig do
      params(destination: BindingDestination, target: T.untyped, key: T.nilable(String),
             object: Swill::Object, key_path: String,
             transformer: T.nilable(ValueTransformer),
             placeholder: T.untyped, one_way: T::Boolean).returns(T.proc.void)
    end
    def self.establish(destination, target, key, object, key_path,
                       transformer, placeholder, one_way)
      transforms = transformer != nil && destination.transforms?
      two_way = !one_way && destination.two_way?(target, key)
      Runtime.assertWritablePath(object, key_path) if two_way

      push = ->(_value) do
        value = Runtime.readPath(object, key_path)
        value = transforms ? T.must(transformer).format(value) : (value == nil ? placeholder : value)
        destination.write(target, key, value)
      end
      push.(nil)
      release_push = Runtime.observePath(object, key_path, push)
      return release_push unless two_way

      release_pull = destination.listen(target, key, ->(value) do
        Runtime.writePath(object, key_path, transforms ? T.must(transformer).parse(value) : value)
      end)

      ->() do
        release_push.()
        release_pull.()
      end
    end
  end
end
