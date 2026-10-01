# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    class CompileError < StandardError; end

    # Intrinsics introduced by built-in filters must not capture source classes.
    JS_INTRINSICS = %w[Object Array String Number Math JSON Error Promise AbortController MutationObserver URLSearchParams].freeze

    # The framework classes plain JavaScript reaches by a public name on the
    # Swill global, such as Swill.Controller or Swill.Model.Base. A class is
    # named when plain JavaScript subclasses it, constructs it, or calls its
    # class methods. Machinery the framework drives itself, classes that are
    # only ever handed to an application (Window, Notification), and modules,
    # which a JavaScript class cannot include, are not.
    #
    # Every class is also on the global under its generated identifier, which
    # compiled applications link against; that name is private. The browser
    # build and the documentation both read this, so the names a page offers
    # and the names the docs show cannot drift.
    JAVASCRIPT_NAMES = {
      "Object" => "Swill::Object",
      "Swell" => "Swill::Swell",
      "ArrayController" => "Swill::ArrayController",
      "Controller" => "Swill::Controller",
      "Application" => "Swill::Application",
      "View" => "Swill::View",
      "List" => "Swill::Controller::List",
      "SortableList" => "Swill::Controller::SortableList",
      "Editor" => "Swill::Controller::Editor",
      "InlineEditor" => "Swill::Controller::InlineEditor",
      "EditableList" => "Swill::Controller::EditableList",
      "Control" => "Swill::Control",
      "TextField" => "Swill::Control::TextField",
      "Button" => "Swill::Control::Button",
      "Select" => "Swill::Control::Select",
      "CustomSelect" => "Swill::Control::CustomSelect",
      "Segmented" => "Swill::Control::Segmented",
      "ImageView" => "Swill::Control::ImageView",
      "Alert" => "Swill::Alert",
      "Bundle" => "Swill::Bundle",
      "Image" => "Swill::Image",
      "NotificationCenter" => "Swill::NotificationCenter",
      "Wire" => "Swill::Wire",
      "ValueTransformer" => "Swill::ValueTransformer",
      "Model.Base" => "Swill::Model::Base",
      "Model.Editable" => "Swill::Model::Editable",
      "Model.Resource" => "Swill::Model::Resource",
      "Model.Store" => "Swill::Model::Store",
      "Model.Codec" => "Swill::Model::Codec",
      "Model.PlainJSON" => "Swill::Model::PlainJSON",
      "Model.JSONAPI" => "Swill::Model::JSONAPI",
      "Model.Dataset" => "Swill::Model::Dataset",
      "Model.Collection" => "Swill::Model::Collection",
      "Model.ResultSet" => "Swill::Model::ResultSet",
      "Distant.Object" => "Swill::Distant::Object",
      "Distant.Client" => "Swill::Distant::Client"
    }.freeze

    # The public classes a plain JavaScript class may extend directly. The
    # other named classes are used as they are.
    JAVASCRIPT_ROOTS = %w[
      Object ArrayController Controller Application View List SortableList Editor InlineEditor EditableList
      Control TextField Button Select CustomSelect ValueTransformer
      Model.Base Model.Resource Distant.Object
    ].freeze

    # Encoded names shared by the compiler, its metadata, and generated code.
    module Names
      module_function

      def identifier(name)
        # Ordinary names stay ordinary; namespaces use __. Escape source
        # underscores first so A::B and A__B remain distinct. The single
        # underscore in Ruby_Runtime cannot occur in an encoded source name.
        return "Ruby_#{name}" if (%w[Runtime Superclass] + JS_INTRINSICS + DOM::CLASSES.keys).include?(name)
        name.split("::").map { |part| part.gsub("_", "_u") }.join("__")
      end

      # Ruby members in JavaScript spelling: snake_case becomes camelCase
      # with these acronyms upper-cased; a predicate gains an is prefix unless
      # it is phrased as a verb (acceptsFirstResponder, rowsAreViews), and a
      # bang becomes Bang (saveBang), so save and save! are both possible and
      # neither's name depends on the other. A name starting with an underscore
      # is JavaScript's own (an expando such as __swill_view__) and is left
      # alone.
      ACRONYMS = %w[dom url json html].freeze
      PREDICATE_VERBS = %w[accepts allow allows can confirm contains has holds includes matches needs requires should supports].freeze
      PREDICATE_LINKS = %w[are is has].freeze

      def member(name)
        text = name.to_s
        # Indexing on a declared class is a method, not JavaScript subscripting.
        return "$index" if text == "[]"
        # Only a Ruby-shaped name is respelled; anything else (a leading
        # underscore, a double underscore) is left as written.
        return text unless text.match?(/\A[a-z][a-z0-9]*(?:_[a-z0-9]+)*[?!=]?\z/)
        suffix = text[/[?!=]\z/]
        words = text.delete_suffix(suffix.to_s).split("_")
        camel = words.first + words.drop(1).map { |word| ACRONYMS.include?(word) ? word.upcase : "#{word[0].upcase}#{word[1..]}" }.join
        if suffix == "?" && !PREDICATE_VERBS.include?(words.first) && (words.drop(1) & PREDICATE_LINKS).empty?
          camel = "is#{camel[0].upcase}#{camel[1..]}"
        end
        return "#{camel}=" if suffix == "="
        suffix == "!" ? "#{camel}Bang" : camel
      end
    end
  end
end
