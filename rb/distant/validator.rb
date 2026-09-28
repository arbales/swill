# frozen_string_literal: true

module Swill
  module Distant
    # `Validator` checks what crosses the protocol boundary against the
    # schema: the arguments a browser sends to a remote method, the
    # attributes it writes, and the value a remote method returns. The
    # `Dispatcher` calls it before invoking a method and before encoding its
    # result, and a failed check is answered as an `ERROR` with the code
    # `invalid_arguments` (the wrong number of positional arguments, a
    # missing required keyword, or an unknown keyword) or `type_mismatch` (a
    # value that does not match its declared `Type`). Types are the schema's
    # encoded Hashes, as `Type#to_h` produces them. See
    # [Server Data](rdoc-ref:doc/server_data.md).
    module Validator
      module_function

      # Checks `arguments` and `keywords` against the remote method
      # `declaration` and returns the positional parameter bound to each
      # argument, as `positional_parameters!` does. Raises
      # `Dispatcher::RemoteError` with code `invalid_arguments` when the
      # positional count is wrong, a required keyword is missing, or a
      # keyword is not declared and the method has no keyword rest — the
      # missing and extra names are in `details` — and with code
      # `type_mismatch` when an argument does not match its parameter's type.
      def arguments!(declaration, arguments, keywords)
        parameters = declaration.fetch("parameters")
        bindings = positional_parameters!(declaration, arguments.length)
        arguments.each_with_index do |value, index|
          parameter = bindings[index]
          value!(value, parameter.fetch("type"), "argument #{parameter['name']}") if parameter
        end

        keyed = parameters.select { |item| %w[keyreq key keyrest].include?(item["kind"]) }
        required_keys = keyed.select { |item| item["kind"] == "keyreq" }.map { |item| item["name"] }
        missing = required_keys - keywords.keys.map(&:to_s)
        named = keyed.reject { |item| item["kind"] == "keyrest" }
        allowed = named.map { |item| item["name"] }
        extra = keywords.keys.map(&:to_s) - allowed unless keyed.any? { |item| item["kind"] == "keyrest" }
        unless missing.empty? && (extra.nil? || extra.empty?)
          raise Dispatcher::RemoteError.new("invalid_arguments", "invalid keyword arguments",
                                            details: { "missing" => missing, "extra" => extra || [] })
        end
        keyed.each do |parameter|
          next if parameter["kind"] == "keyrest"
          key = parameter["name"].to_sym
          value!(keywords[key], parameter.fetch("type"), "argument #{key}") if keywords.key?(key)
        end
        rest = keyed.find { |item| item["kind"] == "keyrest" }
        if rest
          keywords.each do |key, value|
            value!(value, rest.fetch("type"), "argument #{key}") unless allowed.include?(key.to_s)
          end
        end
        bindings
      end

      # Returns the positional parameter of `declaration` bound to each of
      # `count` arguments, as an array of parameter Hashes in argument order,
      # following Ruby's rules: required parameters before the first optional
      # bind first, required parameters after the optionals bind from the
      # end, the optionals take what remains in order, and a rest parameter
      # takes the rest. Raises `Dispatcher::RemoteError` with code
      # `invalid_arguments` when `count` is below the required number or
      # above the maximum for a method without a rest parameter.
      def positional_parameters!(declaration, count)
        positional = declaration.fetch("parameters").select { |item| %w[req opt rest].include?(item["kind"]) }
        required = positional.count { |item| item["kind"] == "req" }
        rest_index = positional.index { |item| item["kind"] == "rest" }
        maximum = rest_index ? nil : positional.length
        unless count >= required && (!maximum || count <= maximum)
          raise Dispatcher::RemoteError.new("invalid_arguments", "wrong number of arguments")
        end

        before = rest_index ? positional[0...rest_index] : positional
        after = rest_index ? positional[(rest_index + 1)..] : []
        first_optional = before.index { |item| item["kind"] == "opt" } || before.length
        prefix = before[0...first_optional]
        tail = before[first_optional..]
        post = tail.select { |item| item["kind"] == "req" } + after
        optionals = tail.select { |item| item["kind"] == "opt" }
        bindings = Array.new(count)
        prefix.each_with_index { |parameter, index| bindings[index] = parameter }
        post.reverse_each.with_index { |parameter, index| bindings[count - index - 1] = parameter }
        front = prefix.length
        back = count - post.length
        optionals.each do |parameter|
          break if front >= back
          bindings[front] = parameter
          front += 1
        end
        rest = rest_index && positional[rest_index]
        (front...back).each { |index| bindings[index] = rest }
        bindings
      end

      # Checks a remote method's return `value` against its declared `type`.
      # Raises `Dispatcher::RemoteError` with code `type_mismatch` when it
      # does not match; the message names the return value.
      def result!(value, type)
        value!(value, type, "return value")
      end

      # Checks `value` against `type`. Raises `Dispatcher::RemoteError` with
      # code `type_mismatch` when it does not match, naming `subject` (such
      # as "argument title") and the type in the message.
      def value!(value, type, subject)
        return if matches?(value, type)

        raise Dispatcher::RemoteError.new("type_mismatch", "#{subject} does not match #{describe(type)}")
      end

      # Returns true when `value` matches the encoded `type`: anything for
      # `dynamic`; nil or the member for `optional`; any member for `union`;
      # a literal's name by string form for `enum`; an Array or Sequel
      # dataset whose items all match the member for `array` and
      # `result_set`; an instance of the named class for `model`,
      # `model_ref` and `value`; and `primitive?` for a primitive.
      def matches?(value, type)
        kind = type.fetch("kind")
        members = type.fetch("members", [])
        case kind
        when "dynamic" then true
        when "optional" then value.nil? || matches?(value, members.fetch(0))
        when "union" then members.any? { |member| matches?(value, member) }
        when "enum" then members.any? { |member| value.to_s == member["name"] }
        when "array", "result_set" then collection?(value) && value.all? { |item| matches?(item, members.fetch(0)) }
        when "model", "model_ref", "value" then value && value.class.name == (type["name"] || members.dig(0, "name"))
        when "primitive" then primitive?(value, type.fetch("name"))
        else false
        end
      end

      # Returns true when `value` is an Array or, with Sequel loaded, a
      # `Sequel::Dataset`.
      def collection?(value)
        value.is_a?(Array) || (defined?(Sequel::Dataset) && value.is_a?(Sequel::Dataset))
      end

      # Returns true when `value` is of the primitive `name`: `Boolean`
      # accepts true and false, `Float` any Numeric, `Time` a Time or
      # DateTime, `Date` a Date, and any other name an instance of the class
      # it names; false when no such class exists.
      def primitive?(value, name)
        case name
        when "Boolean" then [true, false].include?(value)
        when "Float" then value.is_a?(Numeric)
        when "Time" then value.is_a?(Time) || value.is_a?(DateTime)
        when "Date" then value.is_a?(Date)
        else value.is_a?(::Object.const_get(name))
        end
      rescue NameError
        false
      end

      # Returns the name of `type` for an error message, or its kind when it
      # has no name.
      def describe(type)
        type["name"] || type["kind"]
      end

      private_class_method :matches?, :collection?, :primitive?, :describe
    end
  end
end
