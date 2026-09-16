# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # The browser as the compiler knows it: the DOM classes and JavaScript
    # intrinsics framework code may name, with the members it uses. One
    # table serves two readers. Sorbet reads it as a generated RBI
    # (sorbet/rbi/dom.rbi), so framework signatures can say Element rather
    # than T.untyped. The compiler reads it to lower a native receiver: a
    # member listed as an attribute is property access, one listed as a
    # method is a call, whatever the source's parentheses, and the member's
    # result type carries on into Ruby lowering (a String from getAttribute
    # gets strip, not trim). A member not listed is native by the source's
    # own spelling and yields an untyped JavaScript value.
    module DOM
      # Member kinds: :attr reads, :accessor reads and writes, :method calls.
      # A method's parameters are "name: Type" pairs; "name?: Type" is
      # optional. Types are Sorbet texts.
      CLASSES = {
        "EventTarget" => [nil, {
          "addEventListener" => [:method, "void", "type: String, listener: T.proc.params(event: Event).void, options?: T.untyped"],
          "removeEventListener" => [:method, "void", "type: String, listener: T.proc.params(event: Event).void, options?: T.untyped"],
          "dispatchEvent" => [:method, "T::Boolean", "event: Event"]
        }],
        "Node" => ["EventTarget", {
          "nodeType" => [:attr, "Integer"],
          "nodeName" => [:attr, "String"],
          "textContent" => [:accessor, "String"],
          "parentElement" => [:attr, "T.nilable(Element)"],
          "parentNode" => [:attr, "T.nilable(Node)"],
          "ownerDocument" => [:attr, "Document"],
          "isConnected" => [:attr, "T::Boolean"],
          "contains" => [:method, "T::Boolean", "other: T.nilable(Node)"],
          "appendChild" => [:method, "Node", "node: Node"],
          "insertBefore" => [:method, "Node", "node: Node, reference: T.nilable(Node)"],
          "removeChild" => [:method, "Node", "node: Node"],
          "cloneNode" => [:method, "T.self_type", "deep?: T::Boolean"]
        }],
        "Element" => ["Node", {
          "tagName" => [:attr, "String"],
          "id" => [:accessor, "String"],
          "children" => [:attr, "HTMLCollection"],
          "firstElementChild" => [:attr, "T.nilable(Element)"],
          "nextElementSibling" => [:attr, "T.nilable(Element)"],
          "classList" => [:attr, "DOMTokenList"],
          "getAttribute" => [:method, "T.nilable(String)", "name: String"],
          "getAttributeNames" => [:method, "T::Array[String]", ""],
          "[]=" => [:method, "void", "name: String, value: T.untyped"],
          "hasAttribute" => [:method, "T::Boolean", "name: String"],
          "setAttribute" => [:method, "void", "name: String, value: String"],
          "removeAttribute" => [:method, "void", "name: String"],
          "matches" => [:method, "T::Boolean", "selector: String"],
          "querySelector" => [:method, "T.nilable(Element)", "selector: String"],
          "querySelectorAll" => [:method, "NodeList", "selector: String"],
          "remove" => [:method, "void", ""],
          "after" => [:method, "void", "node: Node"],
          "append" => [:method, "void", "node: Node"],
          "replaceChildren" => [:method, "void", "nodes?: Node"],
          "focus" => [:method, "void", ""],
          "blur" => [:method, "void", ""],
          "scrollIntoView" => [:method, "void", "options?: T.untyped"],
          # Form and dialog members live on Element here rather than on each
          # HTML interface, since framework code reaches them through a
          # generic element.
          "value" => [:accessor, "String"],
          "type" => [:attr, "String"],
          "name" => [:attr, "String"],
          "title" => [:accessor, "String"],
          "checked" => [:accessor, "T::Boolean"],
          "disabled" => [:accessor, "T::Boolean"],
          "hidden" => [:accessor, "T::Boolean"],
          "readOnly" => [:accessor, "T::Boolean"],
          "open" => [:accessor, "T::Boolean"],
          "show" => [:method, "void", ""],
          "showModal" => [:method, "void", ""],
          "close" => [:method, "void", ""],
          # Swill's own expandos on managed elements.
          "__swill_view__" => [:accessor, "T.nilable(Swill::View)"],
          "__swill_action__" => [:accessor, "T::Boolean"],
          "__swill_row__" => [:accessor, "T.nilable(T.proc.void)"],
          "__swill_application__" => [:accessor, "T.nilable(Swill::Application)"]
        }],
        "HTMLTemplateElement" => ["Element", {
          "content" => [:attr, "DocumentFragment"]
        }],
        "DocumentFragment" => ["Node", {
          "firstElementChild" => [:attr, "T.nilable(Element)"],
          "children" => [:attr, "HTMLCollection"],
          "querySelector" => [:method, "T.nilable(Element)", "selector: String"],
          "querySelectorAll" => [:method, "NodeList", "selector: String"]
        }],
        "Document" => ["Node", {
          "body" => [:attr, "Element"],
          "documentElement" => [:attr, "Element"],
          "activeElement" => [:attr, "T.nilable(Element)"],
          "defaultView" => [:attr, "T.nilable(DOMWindow)"],
          "readyState" => [:attr, "String"],
          "querySelector" => [:method, "T.nilable(Element)", "selector: String"],
          "querySelectorAll" => [:method, "NodeList", "selector: String"],
          "createElement" => [:method, "Element", "tag: String"],
          "getSelection" => [:method, "T.nilable(Selection)", ""]
        }],
        # DOMWindow, since Swill::Window is the framework's own class.
        "DOMWindow" => ["EventTarget", {
          "document" => [:attr, "Document"],
          "location" => [:attr, "Location"],
          "history" => [:attr, "History"]
        }],
        "Location" => [nil, {
          "hash" => [:accessor, "String"],
          "href" => [:accessor, "String"],
          "pathname" => [:attr, "String"],
          "search" => [:attr, "String"]
        }],
        "History" => [nil, {
          "state" => [:attr, "T.untyped"],
          "pushState" => [:method, "void", "state: T.untyped, title: String, url?: T.nilable(String)"],
          "replaceState" => [:method, "void", "state: T.untyped, title: String, url?: T.nilable(String)"]
        }],
        "Event" => [nil, {
          "type" => [:attr, "String"],
          "target" => [:attr, "Element"],
          "relatedTarget" => [:attr, "T.nilable(Element)"],
          "preventDefault" => [:method, "void", ""],
          "stopPropagation" => [:method, "void", ""]
        }],
        "KeyboardEvent" => ["Event", {
          "key" => [:attr, "String"],
          "shiftKey" => [:attr, "T::Boolean"]
        }],
        "MouseEvent" => ["Event", {
          "shiftKey" => [:attr, "T::Boolean"]
        }],
        "PageTransitionEvent" => ["Event", {
          "persisted" => [:attr, "T::Boolean"]
        }],
        "HTMLCollection" => [nil, {
          "length" => [:attr, "Integer"]
        }],
        "NodeList" => [nil, {
          "length" => [:attr, "Integer"],
          "forEach" => [:method, "void", "callback: T.proc.params(node: Element).void"]
        }],
        "DOMTokenList" => [nil, {
          "add" => [:method, "void", "name: String"],
          "remove" => [:method, "void", "name: String"],
          "toggle" => [:method, "T::Boolean", "name: String, force?: T::Boolean"],
          "contains" => [:method, "T::Boolean", "name: String"]
        }],
        "Selection" => [nil, {
          "removeAllRanges" => [:method, "void", ""]
        }],
        "MutationRecord" => [nil, {
          "addedNodes" => [:attr, "NodeList"],
          "removedNodes" => [:attr, "NodeList"]
        }],
        "MutationObserver" => [nil, {
          "observe" => [:method, "void", "target: Node, options: T.untyped"],
          "disconnect" => [:method, "void", ""]
        }],
        "Promise" => [nil, {
          "then" => [:method, "Promise", "callback: T.untyped"]
        }],
        "URLSearchParams" => [nil, {
          "forEach" => [:method, "void", "callback: T.proc.params(value: String, key: String).void"],
          "get" => [:method, "T.nilable(String)", "key: String"],
          "has" => [:method, "T::Boolean", "key: String"],
          "set" => [:method, "void", "key: String, value: String"],
          "delete" => [:method, "void", "key: String"],
          "toString" => [:method, "String", ""]
        }]
      }.freeze

      # Classes constructed with new(...), and their constructor parameters.
      CONSTRUCTORS = {
        "MutationObserver" => "callback: T.proc.params(records: T::Array[MutationRecord], observer: MutationObserver).void",
        "Promise" => "executor: T.proc.params(resolve: T.untyped, reject: T.untyped).void",
        "URLSearchParams" => "init?: String"
      }.freeze

      # Indexed collections: value[index] yields this element type.
      INDEXED = {"HTMLCollection" => "Element", "NodeList" => "Element"}.freeze

      def self.native?(name)
        CLASSES.key?(name)
      end

      # The member's [kind, type] along the class chain, or nil.
      def self.member(klass, name)
        current = klass
        while current
          parent, members = CLASSES.fetch(current)
          found = members[name.to_s]
          return found if found
          current = parent
        end
        nil
      end

      def self.rbi
        lines = ["# typed: true", "# Generated by the Swill compiler from knowledge/dom.rb. Do not edit.", ""]
        CLASSES.each do |name, (parent, members)|
          lines << (parent ? "class #{name} < #{parent}" : "class #{name}")
          lines << "  extend T::Sig"
          if (constructor = CONSTRUCTORS[name])
            lines << "  sig { #{signature(constructor, 'void')} }"
            lines << "  def initialize(#{parameters(constructor)}); end"
          end
          if (element = INDEXED[name])
            lines << "  sig { params(index: Integer).returns(#{element}) }"
            lines << "  def [](index); end"
          end
          members.each do |member, (kind, type, params)|
            case kind
            when :attr, :accessor
              lines << "  sig { returns(#{type}) }"
              lines << "  def #{member}; end"
              if kind == :accessor
                lines << "  sig { params(value: #{type}).returns(#{type}) }"
                lines << "  def #{member}=(value); end"
              end
            when :method
              lines << "  sig { #{signature(params, type)} }"
              lines << "  def #{member}(#{parameters(params)}); end"
            end
          end
          lines << "end"
          lines << ""
        end
        lines.join("\n")
      end

      # "name: Type" pairs, split at top-level commas only, so a
      # T.proc.params(a: X, b: Y) type stays whole.
      def self.pairs(params)
        parts = []
        depth = 0
        current = +""
        params.to_s.each_char do |char|
          depth += 1 if "[(".include?(char)
          depth -= 1 if "])".include?(char)
          if char == "," && depth.zero?
            parts << current
            current = +""
          else
            current << char
          end
        end
        parts << current
        parts.map(&:strip).reject(&:empty?).map do |pair|
          name, type = pair.split(":", 2).map(&:strip)
          [name.delete_suffix("?"), type, name.end_with?("?")]
        end
      end

      def self.signature(params, returns)
        declared = pairs(params).map { |name, type, _optional| "#{name}: #{type}" }
        result = returns == "void" ? "void" : "returns(#{returns})"
        declared.empty? ? result : "params(#{declared.join(', ')}).#{result}"
      end

      def self.parameters(params)
        pairs(params).map { |name, _type, optional| optional ? "#{name} = nil" : name }.join(", ")
      end
    end
  end
end
