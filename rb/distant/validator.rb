# frozen_string_literal: true

module Swill
  module Distant
    # Runtime checks at the untrusted protocol boundary.
    module Validator
      module_function

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

      def result!(value, type)
        value!(value, type, "return value")
      end

      def value!(value, type, subject)
        return if matches?(value, type)

        raise Dispatcher::RemoteError.new("type_mismatch", "#{subject} does not match #{describe(type)}")
      end

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

      def collection?(value)
        value.is_a?(Array) || (defined?(Sequel::Dataset) && value.is_a?(Sequel::Dataset))
      end

      def primitive?(value, name)
        case name
        when "Boolean" then [true, false].include?(value)
        when "Float" then value.is_a?(Numeric)
        when "Time" then value.is_a?(Time) || value.is_a?(DateTime)
        when "Date" then value.is_a?(Date)
        else value.is_a?(Object.const_get(name))
        end
      rescue NameError
        false
      end

      def describe(type)
        type["name"] || type["kind"]
      end
    end
  end
end
