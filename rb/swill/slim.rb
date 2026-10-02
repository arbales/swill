# typed: ignore
# frozen_string_literal: true

# Optional Slim rendering for Swill markup. Require this file explicitly;
# neither the browser bundle nor the core gem depends on Slim.
require "slim"

module Swill
  module Slim
    # Rewrites parsed Slim tags before its ordinary HTML filters run. The
    # result is regular Swill markup, so server and static pages awaken alike.
    class Markup < Temple::Filter
      define_options namespace: nil

      TAGS = {
        "Swill::Control::Button" => "button",
        "Swill::Control::TextField" => "input",
        "Swill::Control::Select" => "select",
        "Swill::Control::ImageView" => "img"
      }.freeze
      CLASS_NAME = /\A[A-Z]\w*(?:::[A-Z]\w*)*\z/
      HTML_TAG = /\A[a-z][a-z0-9-]*\z/

      def call(expression)
        rewrite(expression)
      end

      private

      def rewrite(expression)
        return expression unless expression.is_a?(Array)
        return rewrite_tag(expression) if expression[0, 2] == %i[html tag]

        expression.map { |child| rewrite(child) }
      end

      def rewrite_tag(expression)
        _, _, name, attributes, *content = expression
        class_tag = name.match?(CLASS_NAME)
        attributes = attributes.dup
        attributes[2..] = attributes.drop(2).map { |attribute| rewrite_attribute(attribute, class_tag) }

        if class_tag
          namespace = options[:namespace]
          absolute = name.start_with?("Swill::", "#{namespace}::")
          class_name = absolute ? name : "#{namespace}::#{name}"
          raise ArgumentError, "A namespace is required for #{name}" if !absolute && namespace.to_s.empty?
          raise ArgumentError, "Invalid application namespace: #{namespace}" unless class_name.match?(CLASS_NAME)
          raise ArgumentError, "#{name} already has a klass attribute" if attribute_named?(attributes, "klass")

          element = take_element(attributes) || TAGS.fetch(class_name, "div")
          attributes << [:html, :attr, "klass", [:static, class_name]]
          name = element
        end

        [:html, :tag, name, attributes, *content.map { |part| rewrite(part) }]
      end

      def rewrite_attribute(attribute, class_tag)
        return attribute unless attribute.is_a?(Array) && attribute[0, 2] == %i[html attr]

        _, _, name, value = attribute
        if name.end_with?("~")
          raise ArgumentError, "Invalid binding attribute: #{name}" unless name.match?(/\A[a-z][a-z0-9-]*~\z/)
          raise ArgumentError, "#{name} needs a quoted literal binding path" unless literal(value)

          return [:html, :attr, "bind-#{name.delete_suffix('~')}", value]
        end
        name = "data-action" if class_tag && name == "action"
        [:html, :attr, name, value]
      end

      def take_element(attributes)
        index = attributes.index { |attribute| attribute[0, 3] == [:html, :attr, "element"] }
        return nil unless index

        value = literal(attributes.delete_at(index)[3])
        raise ArgumentError, "element needs a literal HTML tag" unless value&.match?(HTML_TAG)

        value
      end

      def attribute_named?(attributes, name)
        attributes.any? { |attribute| attribute[0, 3] == [:html, :attr, name] }
      end

      def literal(value)
        return value[1] if value[0] == :static
        return unless value[0, 2] == [:escape, true]

        inner = value[2]
        return unless inner[0, 2] == %i[slim interpolate]

        return if inner[2].include?("\#{")

        inner[2]
      end
    end

    class Engine < ::Slim::Engine
      after "Slim::Parser", Markup
    end

    # An explicitly configured, reusable template. A file is read and
    # compiled once; create another instance after its source changes.
    Template = Temple::Templates::Tilt(Engine)

    def self.from_source(source, namespace:)
      Template.new(nil, 1, namespace: namespace) { source }
    end

    def self.from_file(path, namespace:)
      Template.new(path, 1, namespace: namespace)
    end
  end
end
