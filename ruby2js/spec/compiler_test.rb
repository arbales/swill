require "minitest/autorun"
require "open3"
require_relative "../lib/swill-ruby2js/compiler"

class CompilerTest < Minitest::Test
  TEST_OBJECT = <<~RUBY
    class TestObject
      def coerce_property_value(name, value, previous); value; end
      def property_will_change(name, previous, value); end
    end
  RUBY

  def compiler_with_test_object
    Swill::Ruby2JS::Compiler.new.add(TEST_OBJECT)
  end

  def compile(body)
    compiler_with_test_object.add("class Example < TestObject\n#{body}\nend")
  end

  def javascript(body)
    compile(body).javascript(runtime: "../lib/swill/runtime.mjs")
  end

  def test_declarations_generate_lookup_data_and_typed_readers_and_writers
    compiler = compile('property :name, type: String, default: ""')
    assert_includes compiler.javascript(runtime: "./runtime.mjs"), 'Runtime.install(meta);'
    assert_includes compiler.rbi, "sig { params(value: String).returns(String) }"
    assert_includes compiler.rbi, "def name=(value)"
    assert_equal "String", compiler.knowledge.interface.last["properties"].first["type"]
  end

  def test_computed_has_no_writer_and_gets_a_typed_expression_probe
    compiler = compile("property :label, type: String do\n42\nend")
    refute_includes compiler.rbi, "def label="
    assert_includes compiler.type_probes, "sig { returns(String) }"
    assert_includes compiler.type_probes, "42"
  end

  def test_annotations_are_erased
    js = javascript("extend T::Sig\nsig { returns(String) }\ndef name; \"Ada\"; end")
    refute_match(/\bT\b|\bsig\b/, js)
    assert_includes js, "name()"
  end

  def test_javascript_only_source_uses_native_constructor_and_dom_calls
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add(<<~RUBY, javascript_only: true)
      class BrowserView
        def initialize(element)
          super()
          @element = element
        end

        def wire()
          @element.addEventListener("click") { |event| event.preventDefault() }
        end

        def notify(callback, event)
          callback.(event)
          @listener.call(event)
        end
      end
    RUBY
    js = compiler.javascript(runtime: "./runtime.mjs")
    assert_includes js, "constructor(element)"
    assert_match(/this\._element\.addEventListener\(\s*"click"/, js)
    assert_includes js, "callback(event)"
    assert_includes js, "this._listener.call(null, event)"
    refute_includes js, "Runtime.read"
    refute_includes js, "ReactiveObject"
  end

  def test_binding_and_action_dom_behavior_is_compiled_from_framework_ruby
    compiler = Swill::Ruby2JS::Compiler.new
    %w[
      lib/swill/core/observable.rb
      lib/swill/core/object.rb
      lib/swill/core/ownership.rb
      lib/swill/core/object_bindings.rb
      lib/swill/core/responder.rb
      lib/swill/core/view.rb
      lib/swill/core/controller.rb
      lib/swill/core/bindings.rb
      lib/swill/core/actions.rb
      lib/swill/core/outlets.rb
      lib/swill/core/awakening.rb
      lib/swill/core/fragments.rb
      lib/swill/core/window.rb
      lib/swill/core/application.rb
    ].each do |path|
      compiler.add(File.read(path), file: path, javascript_only: true)
    end

    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "class Swill__Bindings extends Swill__Object"
    assert_includes js, "Runtime.observePath(object, path, render)"
    assert_includes js, "Runtime.isTruthy(value)"
    assert_includes js, "element.addEventListener(event_name, handler)"
    assert_includes js, "class Swill__Actions extends Swill__Object"
    assert_includes js, "controller.perform_action(action_name, element, event)"
    assert_includes js, "new Swill__Bindings().wire(controller)"
    assert_includes js, "new Swill__Actions().wire(controller)"
    assert_match(/document\.addEventListener\(\s*"DOMContentLoaded"/, js)
    assert_includes js, "if (!event.persisted) return application.terminate()"
    modules = compiler.modules(name: "fixture", runtime: "../lib/swill/runtime.mjs", publish: "Swill", launch: "Swill::Launcher")
    entry = modules.fetch("fixture.mjs")
    assert_includes entry, "if (typeof document !== \"undefined\")"
    assert_includes entry, 'new (Runtime.resolve("Swill::Launcher"))().install(document)'
    assert_raises(Spike::CompileError) do
      compiler.modules(name: "fixture", runtime: "../lib/swill/runtime.mjs", launch: "Swill::Launcher")
    end
  end

  def test_runtime_sorbet_constructs_are_not_silently_erased
    %w[must cast let unsafe].each do |operation|
      assert_raises(Spike::CompileError) { javascript("def name; T.#{operation}(nil); end") }
    end
    assert_raises(Spike::CompileError) { javascript("def name; T::Struct.new; end") }
    assert_raises(Spike::CompileError) do
      javascript("def name; value = T.let([], T::Array[String]); value; end")
    end
    assert_raises(Spike::CompileError) do
      javascript("property :name, type: String do\nvalue = T.let('Ada', String)\nvalue\nend")
    end
  end

  def test_dynamic_declarations_and_mutable_defaults_are_rejected
    ['property field, type: String', 'property :names, type: T::Array[String], default: [1]',
     'property :name, type: String, nonsense: true', 'prepend Other'].each do |body|
      assert_raises(Spike::CompileError) { javascript(body) }
    end
  end

  def test_attribute_requires_an_explicit_default
    error = assert_raises(Spike::CompileError) do
      javascript("attribute :name, type: String")
    end
    assert_equal "attribute declaration requires default:", error.message
  end

  def test_missing_include_and_reopened_class_are_rejected
    assert_raises(Spike::CompileError) { javascript("include Missing") }
    compiler = compile("")
    assert_raises(Spike::CompileError) { compiler.add("class Example < TestObject; end") }
  end

  def test_included_hooks_reject_dynamic_code_and_colliding_declarations
    [
      'base.attribute field, type: String',
      'base.attribute :name, type: String, default: [1]',
      'base.extend(ClassMethods)',
      'other.attribute :name, type: String',
      'base.attribute(:name, type: String, default: "") { "Ada" }',
      'base.attribute :name, type: String, default: ""; base.attribute :name, type: String, default: ""'
    ].each do |body|
      assert_raises(Spike::CompileError) do
        Spike::Compiler.new.add("module Feature\ndef self.included(base)\n#{body}\nend\nend")
      end
    end
    assert_raises(Spike::CompileError) do
      compiler_with_test_object.add(<<~RUBY)
        module Feature
          def self.included(base)
            base.attribute :name, type: String, default: ""
          end
        end
        class Example < TestObject
          include Feature
          attribute :name, type: String, default: ""
        end
      RUBY
    end
  end

  def test_collection_declarations_and_computed_hook_declarations
    compiler = compiler_with_test_object.add(<<~RUBY)
      module Tracked
        def self.included(base)
          base.property :names, type: T::Array[String], default: []
          base.property :any?, type: T::Boolean do
            !names.empty?
          end
        end
        def add(name); self.names = [*names, name]; end
      end
      class Example < TestObject
        include Tracked
        property :lookup, type: T::Hash[String, T.untyped], default: {}
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "return !Runtime.isEmpty(this.names)"
    assert_includes compiler.rbi, "sig { returns(T::Array[String]) }\n  def names; end"
    assert_equal [[], false, ["Ada"], true, true, {}], execute(js + <<~JS)
      const first = new (Runtime.resolve("Example"))();
      const second = new (Runtime.resolve("Example"))();
      const before = [[...first.names], first.any_predicate];
      first.add("Ada");
      console.log(JSON.stringify([...before, first.names, first.any_predicate, second.names.length === 0, second.lookup]));
    JS
  end

  def test_included_declarations_survive_compiler_interfaces_without_sharing_descriptors
    framework = compiler_with_test_object.add(<<~RUBY)
      module Feature
        def self.included(base)
          base.attribute :name, type: String, default: "Ada"
        end
        def label; name; end
      end
    RUBY
    application = Spike::Compiler.new(imports: framework.knowledge.interface).add(<<~RUBY)
      class First < TestObject
        include Feature
      end
      class Second < TestObject
        include Feature
      end
    RUBY
    first, second = application.knowledge.local
    assert_equal ["name"], first["properties"].map { |property| property["name"] }
    refute_same first["properties"].first, second["properties"].first
    refute_same first["properties"].first, framework.knowledge.local.first["included_properties"].first
    assert_includes application.rbi, "def name=(value)"
    assert_includes application.javascript(runtime: "./runtime.mjs", framework: "./framework.mjs"),
      'mixins: [Feature]'
    refute_includes framework.javascript(runtime: "./runtime.mjs"), "included("
  end

  def test_class_methods_emit_a_separate_factory_and_typed_configuration
    compiler = compiler_with_test_object.add(<<~RUBY)
      module Feature
        def self.included(base)
          base.extend(ClassMethods)
        end
        module ClassMethods
          extend Swill::Declarations
          inheritable_registry :items, :array
          class_setting :mode
          def add(item); items << item; end
        end
      end
      class Example < TestObject
        include Feature
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "classFactory: Feature_ClassMethods"
    assert_includes js, 'Runtime.inheritableRegistry(this, "items", "array")'
    assert_includes js, 'Runtime.classSetting(this, "mode", values)'
    assert_includes compiler.rbi, "def items"
    assert_includes compiler.rbi, "def mode(*values)"
  end

  def test_class_method_protocol_rejects_dynamic_configuration
    [
      "inheritable_registry name",
      "inheritable_registry :items, :set",
      "class_setting(:mode) { |value| value }"
    ].each do |declaration|
      assert_raises(Spike::CompileError) do
        Spike::Compiler.new.add(<<~RUBY)
          module Feature
            def self.included(base); base.extend(ClassMethods); end
            module ClassMethods
              extend Swill::Declarations
              #{declaration}
            end
          end
        RUBY
      end
    end
  end

  def test_modules_can_be_mixins_and_namespaces_at_the_same_time
    compiler = compiler_with_test_object.add(<<~RUBY)
      module Feature
        def label; "feature"; end

        class Helper < TestObject
          def label; "helper"; end
        end
      end

      module Namespace
        class Record < TestObject
          def label; "record"; end
        end
      end

      class Example < TestObject
        include Feature
        def helper_label; Feature::Helper.new.label; end
        def record_label; Namespace::Record.new.label; end
      end
    RUBY

    entries = compiler.knowledge.local.to_h { |entry| [entry["name"], entry["kind"]] }
    assert_equal({
      "TestObject" => "class",
      "Feature" => "mixin",
      "Feature::Helper" => "class",
      "Namespace::Record" => "class",
      "Example" => "class"
    }, entries)
    refute entries.key?("Namespace")

    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs") + <<~JS
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify([object.label(), object.helper_label(), object.record_label()]));
    JS
    assert_equal ["feature", "helper", "record"], execute(js)
  end

  def test_unsupported_reflection_is_a_build_error
    %w[public_send const_get define_method instance_exec].each do |method|
      assert_raises(Spike::CompileError) { javascript("def read(value); #{method}(value); end") }
    end
  end

  def test_forward_superclasses_and_duplicate_inherited_includes_are_rejected
    source = "class Child < Parent; end\nclass Parent < TestObject; end"
    assert_raises(Spike::CompileError) { compiler_with_test_object.add(source).javascript(runtime: "./runtime.mjs") }
    source = <<~RUBY
      module Feature
        def label; "feature"; end
      end
      class Parent < TestObject
        include Feature
      end
      class Child < Parent
        include Feature
      end
    RUBY
    assert_raises(Spike::CompileError) { compiler_with_test_object.add(source).javascript(runtime: "./runtime.mjs") }
  end

  def test_both_ruby_include_orders_and_mixin_reflection_execute_correctly
    source = <<~'RUBY'
      class Base < TestObject
        def token(value); value; end
      end
      module A
        def token(value); "A(#{super(value)})"; end
      end
      module B
        def token(value); "B(#{super(value)})"; end
      end
      class Together < Base
        include A, B
      end
      class Apart < Base
        include A
        include B
      end
    RUBY
    js = compiler_with_test_object.add(source).javascript(runtime: "../lib/swill/runtime.mjs")
    js += <<~JS
      console.log(JSON.stringify(["Together", "Apart"].map(name =>
        Runtime.invoke(new (Runtime.resolve(name))(), "token", "x"))));
    JS
    assert_equal ["A(B(x))", "B(A(x))"], execute(js)
    ruby, status = Open3.capture2e("ruby", "-rjson", "-e",
      "class TestObject; end\n#{source}\nputs JSON.generate([Together.new.token('x'), Apart.new.token('x')])")
    assert status.success?, ruby
    assert_equal ["A(B(x))", "B(A(x))"], JSON.parse(ruby)
  end

  def test_value_semantics_are_lowered_in_executable_code
    js = javascript(<<~RUBY)
      def choose(value); value && "yes"; end
      def negate(value); !value; end
      def same(left, right); left == right; end
      def operands(value); [value || "fallback", value && "right"]; end
      def nested(value); (value || false) ? "truthy" : "falsey"; end
      def lazy(value); value || raise("evaluated"); end
      def normalize(value); value.strip.upcase; end
      def blank(value); value.blank?; end
      extend T::Sig
      sig { params(value: String).returns(String) }
      def typed_normalize(value); value.strip.upcase; end
      sig { params(value: T.nilable(String)).returns(T::Boolean) }
      def typed_blank(value); value.blank?; end
      sig { params(text: String, items: T::Array[String], thing: T.nilable(TestObject)).returns(T::Array[T::Boolean]) }
      def readers(text, items, thing); [text.present?, text.empty?, items.empty?, items.blank?, thing.nil?, text.nil?]; end
      def dynamic_readers(value); [value.present?, value.empty?, value.nil?]; end
    RUBY
    assert_includes js, "Runtime.isTruthy("
    assert_includes js, "Runtime.logicalOr("
    assert_includes js, "Runtime.logicalAnd("
    assert_includes js, "Runtime.upcase(Runtime.strip(value))"
    assert_includes js, "Runtime.isBlank(value)"
    # Untyped receivers use the one dynamic reader instead of a name-based rewrite.
    assert_includes js, 'Runtime.read(Runtime.read(value, "strip"), "upcase")'
    assert_includes js, 'Runtime.read(value, "blank?")'
    assert_includes js, "Runtime.isPresent(text)"
    assert_includes js, "Runtime.isEmpty(text)"
    assert_includes js, "Runtime.isEmpty(items)"
    assert_includes js, "Runtime.isBlank(items)"
    assert_includes js, "thing == null"
    assert_includes js, "text == null"
    assert_includes js, 'Runtime.read(value, "present?")'
    assert_includes js, "value == null", "nil? never needs the runtime"
    refute_includes js, "let $T ="
    refute_includes js, "let $ror ="
    refute_includes js, "let $rand ="
    refute_includes js, "Runtime.valueRead("
    assert_equal [[true, false, true, true, true, false], [false, true, false], [false, nil, true]], execute(js + <<~JS)
      const example = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify([example.readers("Ada", [], null), example.dynamic_readers(""), example.dynamic_readers(null)]));
    JS
    js += <<~JS
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify([object.choose(0), object.choose(false),
        object.negate(""), object.negate(null), object.same([1, [2]], [1, [2]]),
        object.operands(""), object.operands(false), object.operands(0),
        object.nested(""), object.nested(false), object.lazy("ok"),
        object.normalize(" Ada "), object.blank([]), object.blank(0)]));
    JS
    assert_equal ["yes", false, false, true, true, ["", "right"],
                  ["fallback", false], [0, "right"], "truthy", "falsey", "ok",
                  "ADA", true, false], execute(js)
  end

  def test_statically_typed_and_literal_values_use_inline_operators
    js = javascript(<<~RUBY)
      property :maybe_object, type: T.nilable(TestObject), default: nil

      sig { params(text: String, maybe: T.nilable(String), flag: T::Boolean, left: T.untyped, right: T.untyped).void }
      def optimized(text, maybe, flag, left, right)
        local = "Ada"
        [text == "Ada", local != "Grace", maybe || "fallback", flag && "yes", left == right, left || right]
      end

      sig { params(items: T::Array[String], other: T.nilable(TestObject)).returns(T::Array[T.untyped]) }
      def collections(items, other)
        [items == [], other == maybe_object, items || "never"]
      end

      sig { params(flag: T::Boolean).returns(String) }
      def either(flag); flag || "yes"; end

      sig { returns(String) }
      def base_label; "Ada"; end

      def derived_label
        interpolated = "\#{base_label}!"
        [base_label.upcase, interpolated.downcase]
      end

      def property_local
        current = maybe_object
        current ? "yes" : "no"
      end

      def conditionally_assigned(flag)
        local = "Ada" if flag
        local == []
      end
    RUBY

    assert_includes js, 'text === "Ada"'
    assert_includes js, 'local !== "Grace"'
    assert_includes js, 'maybe != null ? maybe : "fallback"'
    assert_includes js, 'flag && "yes"'
    assert_includes js, "Runtime.isEqual(left, right)"
    assert_includes js, "Runtime.logicalOr(left, () => right)"
    assert_includes js, 'return current ? "yes" : "no"'
    assert_includes js, "Runtime.isEqual(local, [])"
    # Typed collections never get identity comparison; typed objects always do.
    assert_includes js, "Runtime.isEqual(items, [])"
    assert_includes js, "other === this.maybe_object"
    assert_includes js, 'items || "never"'
    # Signature return types and interpolation make later reads static.
    assert_includes js, "Runtime.upcase(this.base_label())"
    assert_includes js, "Runtime.downcase(interpolated)"
    # Boolean operands need logical ||; nullish ?? would keep Ruby's false.
    assert_includes js, 'flag || "yes"'
    assert_equal ["yes", true, ["ADA", "ada!"]], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify([object.either(false), object.either(true), object.derived_label()]));
    JS
  end

  def test_string_readers_follow_receiver_types_not_names
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Trimmer < TestObject
        extend T::Sig
        sig { returns(String) }
        def strip; "trimmed"; end
        sig { params(other: Trimmer, text: String, value: T.untyped).returns(T::Array[String]) }
        def readers(other, text, value); [other.strip, text.strip, value.strip]; end
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "other.strip()"
    assert_includes js, "Runtime.strip(text)"
    assert_includes js, 'Runtime.read(value, "strip")'
    assert_equal ["trimmed", "Ada", "trimmed", "Ada"], execute(js + <<~JS)
      const object = new (Runtime.resolve("Trimmer"))();
      console.log(JSON.stringify([...object.readers(object, " Ada ", object), object.readers(object, "x", " Ada ")[2]]));
    JS
  end

  def test_callables_are_invoked_with_their_arguments
    js = javascript(<<~'RUBY')
      def run(callback, list)
        local = ->(value) { value * 2 }
        results = [callback.call(1), callback.(2), local.(3), @stored.call(4)]
        list.forEach { |item| results.push(callback.call(item)) }
        results
      end
      def bare(callback)
        callback.()
      end
    RUBY
    assert_includes js, "callback(1)"
    assert_includes js, "callback(2)"
    assert_includes js, "let local = (value) => value * 2"
    assert_includes js, "local(3)"
    assert_includes js, "this._stored.call(null, 4)"
    assert_includes js, "results.push(callback(item))"
    assert_includes js, "return callback()"
    refute_includes js, "this.lambda"
    assert_equal [11, 12, 6, 40, 15, "bare"], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      object._stored = value => value * 10;
      console.log(JSON.stringify([...object.run(value => value + 10, [5]), object.bare(() => "bare")]));
    JS
  end

  def test_outlets_are_nilable_observable_properties_on_controllers
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add(<<~RUBY, javascript_only: true)
      module Swill
        class Object; end
        class Responder < Swill::Object; end
        class View < Responder; end
        class Controller < Responder; end
      end
    RUBY
    compiler.add(<<~RUBY)
      class Host < Swill::Controller
        outlet :field, type: Swill::View
        outlet :seed, type: T.untyped
        outlet :extra, type: T.nilable(Swill::View), optional: true
      end
    RUBY
    entry = compiler.knowledge.local.last
    assert_equal [
      ["field", "T.nilable(Swill::View)", true, false],
      ["seed", "T.untyped", true, false],
      ["extra", "T.nilable(Swill::View)", true, true]
    ], entry["properties"].map { |p| p.values_at("name", "type", "outlet", "optional") }
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "outlet: true"
    assert_includes js, "optional: true"
    assert_includes compiler.rbi, "sig { returns(T.nilable(Swill::View)) }\n  def field; end"
    assert_includes compiler.rbi, "def field=(value); end"
    js += <<~JS
      const host = new (Runtime.resolve("Host"))();
      console.log(JSON.stringify([Runtime.outlets(host).map(o => [o.name, o.optional]), host.field, Runtime.read(host, "seed")]));
    JS
    assert_equal [[["field", false], ["seed", false], ["extra", true]], nil, nil], execute(js)
  end

  def test_outlet_declarations_are_validated
    framework = <<~RUBY
      module Swill
        class Object; end
        class Responder < Swill::Object; end
        class View < Responder; end
        class Controller < Responder; end
      end
    RUBY
    [
      "class Host < Swill::Controller\noutlet :field, type: Swill::View, default: nil\nend",
      "class Host < Swill::Controller\noutlet :field, type: Swill::View, optional: maybe\nend",
      "class Host < Swill::Controller\noutlet :field, type: Swill::View do\n42\nend\nend",
      "class Host < Swill::Controller\noutlet :field, type: Swill::View\noutlet :field, type: Swill::View\nend",
      "class Host < Swill::View\noutlet :field, type: Swill::View\nend",
      "class Host < Swill::Controller\noutlet :field, type: Swill::View, key: :x\nend"
    ].each do |body|
      assert_raises(Spike::CompileError, body) do
        Swill::Ruby2JS::Compiler.new.add(framework, javascript_only: true).add(body).javascript(runtime: "./runtime.mjs")
      end
    end
  end

  def test_restorable_declarations_resolve_their_leaf_types
    framework = <<~RUBY
      module Swill
        class Object; end
        class Responder < Swill::Object; end
        class Controller < Responder; end
      end
    RUBY
    compiler = Swill::Ruby2JS::Compiler.new.add(framework, javascript_only: true).add(<<~RUBY)
      class Person < Swill::Object
        property :age, type: Integer, default: 0
      end
      class Host < Swill::Controller
        property :query, type: String, default: ""
        property :person, type: T.nilable(Person), default: nil
        property :flag, type: T::Boolean, default: false
        property :data, type: T.untyped, default: nil
        restorable :query, key: :q
        restorable "person.age", key: :age
        restorable :flag
        restorable "data.deep"
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, 'restorations: [{ path: "query", key: "q", type: "String" }, { path: "person.age", key: "age", type: "Integer" }, { path: "flag", key: "flag", type: "T::Boolean" }, { path: "data.deep", key: "data.deep", type: null }]'
    assert_equal [["q", "String"], ["age", "Integer"], ["flag", "T::Boolean"], ["data.deep", nil]], execute(js + <<~JS)
      const host = new (Runtime.resolve("Host"))();
      console.log(JSON.stringify(Runtime.restorations(host).map(r => [r.key, r.type])));
    JS
    [
      "restorable query",
      "restorable :query, codec: :string",
      "restorable :missing",
      "restorable \"query.\"",
      "restorable :query, key: :q\nrestorable :flag, key: :q"
    ].each do |body|
      assert_raises(Spike::CompileError, body) do
        Swill::Ruby2JS::Compiler.new.add(framework, javascript_only: true)
          .add("class Host < Swill::Controller\nproperty :query, type: String, default: \"\"\nproperty :flag, type: T::Boolean, default: false\n#{body}\nend")
          .javascript(runtime: "./runtime.mjs")
      end
    end
    assert_raises(Spike::CompileError) do
      Swill::Ruby2JS::Compiler.new.add(framework, javascript_only: true)
        .add("class Plain < Swill::Object\nproperty :query, type: String, default: \"\"\nrestorable :query\nend")
        .javascript(runtime: "./runtime.mjs")
    end
  end

  def test_javascript_intrinsics_are_available_only_to_browser_boundary_code
    js = Swill::Ruby2JS::Compiler.new.add("class Decoder\ndef parse(text); JSON.parse(text); end\nend", javascript_only: true)
      .javascript(runtime: "./runtime.mjs")
    assert_includes js, "JSON.parse(text)"
    error = assert_raises(Spike::CompileError) { javascript("def parse(text); JSON.parse(text); end") }
    assert_includes error.message, "unknown constant JSON"
    js = Swill::Ruby2JS::Compiler.new
      .add("class JSON\ndef parse(text); text; end\nend\nclass Decoder\ndef parse(text); JSON.new.parse(text); end\nend", javascript_only: true)
      .javascript(runtime: "./runtime.mjs")
    assert_includes js, "new Ruby_JSON().parse(text)"
  end

  def test_constructors_taken_from_call_results_are_parenthesized
    shared = javascript("def make(registry); registry.lookup(\"x\").new(1); end\ndef plain; TestObject.new; end")
    assert_includes shared, 'new (registry.lookup("x"))(1)'
    assert_includes shared, "new TestObject()"
    assert_equal ["x", 1], execute(shared + <<~JS)
      const registry = {lookup: name => class { constructor(value) { this.name = name; this.value = value; } }};
      const made = new (Runtime.resolve("Example"))().make(registry);
      console.log(JSON.stringify([made.name, made.value]));
    JS
    browser = Swill::Ruby2JS::Compiler.new
      .add("class Maker\ndef make(name, element); Runtime.resolve(name).new(element); end\nend", javascript_only: true)
      .javascript(runtime: "./runtime.mjs")
    assert_includes browser, "new (Runtime.resolve(name))(element)"
  end

  def test_array_idioms_and_respond_to_lower_from_static_evidence
    js = javascript(<<~'RUBY')
      property :names, type: T.untyped, default: nil

      sig { params(people: T::Array[TestObject], words: T::Array[String]).returns(T.untyped) }
      def survey(people, words)
        seen = []
        people.each do |person|
          seen.push(person.label) if person.respond_to?(:label)
        end
        shouted = words.map { |word| word.upcase }
        short = words.select { |word| word.strip.empty? }
        [seen, shouted, short, words.include?("Ada"), words.size, words.first, words.last, respond_to?(:survey), respond_to?(:missing)]
      end

      def label; "labelled"; end

      def untyped(things)
        things.each { |thing| thing }
      end
    RUBY
    assert_includes js, "people.forEach((person) => {"
    assert_includes js, 'Runtime.respondsTo(person, "label")'
    assert_includes js, "seen.push(person.label())", "block parameters take the element type"
    assert_includes js, "words.map((word) => Runtime.upcase(word))"
    assert_includes js, "words.filter((word) => Runtime.isEmpty(Runtime.strip(word)))"
    assert_includes js, 'words.includes("Ada")'
    assert_includes js, "words.length"
    assert_includes js, "words[0]"
    assert_includes js, "words.at(-1)"
    assert_includes js, 'Runtime.respondsTo(this, "survey")'
    assert_includes js, "things.each(", "an untyped receiver keeps its Ruby method name"
    assert_raises(Spike::CompileError) { javascript("def ask(name); respond_to?(name); end") }
    assert_equal [["labelled"], ["ADA", " "], [" "], true, 2, "Ada", " ", true, false], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify(object.survey([object, {}], ["Ada", " "])));
    JS
  end

  def test_raise_produces_error_objects_and_rejects_other_forms
    js = javascript('def boom; raise "nope"; end')
    assert_includes js, 'throw new Error("nope")'
    assert_raises(Spike::CompileError) { javascript("def boom(value); raise value; end") }
    assert_raises(Spike::CompileError) { javascript("def boom; raise; end") }
    assert_equal ["nope", true], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      try { object.boom(); } catch (error) { console.log(JSON.stringify([error.message, error instanceof Error])); }
    JS
  end

  def test_builtin_pragmas_preserve_trailing_comments_and_execute_on_mri_and_js
    body = <<~RUBY
      def copy_array(value)
        value.dup # Pragma: array
      end
      def copy_hash(value)
        value.dup # Pragma: hash
      end
      def keys(value)
        value.keys # Pragma: hash
      end
      def inferred
        value = [1, 2]
        value.dup
      end
      def arithmetic(value)
        value[0] + 2
      end
      property :copy, type: String do
        "Ada".dup # Pragma: string
      end
    RUBY
    js = javascript(body)
    assert_includes js, ".slice()"
    assert_includes js, "Object.keys("
    assert_equal [[1, 2], {"name" => "Ada"}, ["name"], [1, 2], 5, "Ada", true, true], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      const array = [1, 2], hash = {name: "Ada"};
      console.log(JSON.stringify([object.copy_array(array), object.copy_hash(hash),
        object.keys(hash), object.inferred(), object.arithmetic([3]), object.copy,
        object.copy_array(array) !== array, object.copy_hash(hash) !== hash]));
    JS
    ruby, status = Open3.capture2e("ruby", "-rjson", "-e", <<~RUBY)
      class Example
        def self.property(name, **options, &block); define_method(name, &block); end
        #{body}
      end
      object = Example.new
      array = [1, 2]; hash = {"name" => "Ada"}
      puts JSON.generate([object.copy_array(array), object.copy_hash(hash),
        object.keys(hash), object.inferred, object.arithmetic([3]), object.copy,
        !object.copy_array(array).equal?(array), !object.copy_hash(hash).equal?(hash)])
    RUBY
    assert status.success?, ruby
    assert_equal [[1, 2], {"name" => "Ada"}, ["name"], [1, 2], 5, "Ada", true, true], JSON.parse(ruby)
  end

  def test_filters_do_not_rewrite_framework_methods_or_leak_inferred_types
    js = javascript(<<~RUBY)
      def empty?; "ordinary method"; end
      def keys; "ordinary keys"; end
      def first
        value = {}
        value.keys
      end
      def second(value)
        value.keys
      end
      def third(value)
        value.empty?
      end
    RUBY
    assert_equal [[], "ordinary keys", "ordinary method"], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify([object.first(), object.second(object), object.third(object)]));
    JS
  end

  def test_non_type_pragmas_cannot_silently_desynchronize_metadata
    %w[skip extend nullish logical unknown].each do |pragma|
      error = assert_raises(Spike::CompileError) do
        javascript("def name # Pragma: #{pragma}\n\"Ada\"\nend")
      end
      assert_includes error.message, "unsupported spike pragma #{pragma}"
    end
  end

  def test_pragma_intrinsics_do_not_capture_source_constants_or_lose_mixin_comments
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Object < TestObject
        def label; "source Object"; end
      end
      module Keys
        def keys(value)
          value.keys # Pragma: hash
        end
        def make; Object.new; end
      end
      class Example < TestObject
        include Keys
      end
    RUBY
    assert_equal [["name"], "source Object"], execute(
      compiler.javascript(runtime: "../lib/swill/runtime.mjs") + <<~JS)
        const object = new (Runtime.resolve("Example"))();
        console.log(JSON.stringify([object.keys({name: "Ada"}), object.make().label()]));
      JS
  end

  def test_a_property_name_on_one_class_does_not_turn_another_classes_method_into_a_getter
    compiler = compiler_with_test_object.add(<<~RUBY)
      class PropertyOwner < TestObject
        property :name, type: String, default: "property"
      end
      class MethodOwner < TestObject
        extend T::Sig
        def name; "method"; end
        def own_name; name; end
        def other_name(other); other.name; end
        sig { params(other: PropertyOwner).returns(String) }
        def typed_name(other); other.name; end
        sig { params(other: PropertyOwner, value: String).returns(String) }
        def typed_rename(other, value); other.name = value; end
        sig { params(other: T.nilable(PropertyOwner)).returns(T.nilable(String)) }
        def nilable_name(other); other.name; end
        def untyped_rename(other, value); other.name = value; end
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    # A typed receiver compiles to direct access; an untyped one stays dynamic.
    assert_match(/typed_name\(other\) \{\s*return other\.name;/, js)
    assert_match(/typed_rename\(other, value\) \{\s*return other\.name = value;/, js)
    assert_match(/nilable_name\(other\) \{\s*return other\.name;/, js)
    assert_includes js, 'Runtime.write(other, "name", value)'
    js += <<~JS
      const method = new (Runtime.resolve("MethodOwner"))();
      const property = new (Runtime.resolve("PropertyOwner"))();
      method.typed_rename(property, "typed");
      const typed = property.name;
      method.untyped_rename(property, "untyped");
      let rejected;
      try { method.untyped_rename(method, "x"); } catch (error) { rejected = error.message; }
      console.log(JSON.stringify([method.own_name(), method.other_name(method), method.other_name(property),
        method.typed_name(property), typed, property.name, rejected]));
    JS
    assert_equal ["method", "method", "untyped", "untyped", "typed", "untyped", "Unknown writer: name"], execute(js)
  end

  def test_identifier_encoding_does_not_conflate_namespace_and_underscores
    assert_equal "Record", Spike::Knowledge.identifier("Record")
    assert_equal "Demo__Person", Spike::Knowledge.identifier("Demo::Person")
    refute_equal Spike::Knowledge.identifier("A::B"), Spike::Knowledge.identifier("A__B")
    names = %w[A::B A__B A_uB A_u::B Runtime Ruby_Runtime Superclass Ruby_Superclass]
    assert_equal names.length, names.map { |name| Spike::Knowledge.identifier(name) }.uniq.length
  end

  def test_readable_class_headers_and_reference_based_wiring
    framework = Spike::Compiler.new
      .add(File.read("lib/swill/core/observable.rb"), javascript_only: true)
      .add(File.read("lib/swill/core/object.rb"), javascript_only: true)
      .add(File.read("lib/swill/model/attributes.rb"))
      .add(File.read("lib/swill/model/dirty_tracking.rb"))
      .add(File.read("lib/swill/model/drafts.rb"))
      .add(File.read("lib/swill/model/base.rb"))
    compiler = Spike::Compiler.new(imports: framework.knowledge.interface)
    compiler.add(File.read("examples/models.rb"))
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs", framework: "./framework.mjs")
    assert_includes js, "class Demo__Person extends Swill__Model__Base {"
    assert_includes js, "export { Demo__Person };"
    assert_includes js, "mixins: [NormalizeName, StripName, DecorateName]"
    assert_includes js, "constructor: Demo__Person"
    refute_includes js, "Runtime.include("
    refute_match(/class Generated|extends .*?\(|^\s*;\s*$/, js)
    assert_includes js, '"name": {'
    assert_includes js, "function compute_label()"
    assert_includes js, "Runtime.strip(super.normalize(value))"
    framework_js = framework.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes framework_js, "let copy = new this.constructor"
    refute_includes framework_js, "Runtime.draft("
    assert_equal js, Spike::Compiler.format_javascript(js)
  end

  def test_source_constants_do_not_capture_runtime_or_mixin_plumbing_names
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Runtime < TestObject
        def label; "source runtime"; end
      end
      class Superclass < TestObject
        def label; "source superclass"; end
      end
      module Feature
        def make; Superclass.new; end
      end
      class Example < TestObject
        include Feature
        def make_runtime; Runtime.new; end
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs") + <<~JS
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify([object.make().label(), object.make_runtime().label()]));
    JS
    assert_equal ["source superclass", "source runtime"], execute(js)
  end

  def test_build_is_deterministic
    compiler = compile('property :name, type: String, default: ""')
    assert_equal compiler.javascript(runtime: "./runtime.mjs"), compiler.javascript(runtime: "./runtime.mjs")
  end

  def test_modules_separate_inert_definitions_and_meta_from_initialization
    compiler = compile(<<~RUBY)
      property :name, type: String, default: "Ada"
      property :label, type: String do
        name.upcase
      end
    RUBY
    modules = compiler.modules(name: "fixture", runtime: "../lib/swill/runtime.mjs")
    classes = modules.fetch("fixture.classes.mjs")
    meta = modules.fetch("fixture.meta.mjs")
    entry = modules.fetch("fixture.mjs")
    refute_includes classes, "Runtime.install"
    refute_includes classes, "Runtime.include"
    refute_includes meta, "Runtime.install"
    assert_includes meta, "export const meta"
    assert_includes meta, "constructor: Example"
    assert_equal 1, entry.scan("Runtime.install(meta)").length
    assert_equal modules, compiler.modules(name: "fixture", runtime: "../lib/swill/runtime.mjs")
    modules.each { |name, source| File.write("build/#{name}", source) }
    assert_equal [true, true, "ADA"], execute(<<~JS)
      import {Runtime} from "../lib/swill/runtime.mjs";
      import {Example} from "./fixture.classes.mjs";
      import {meta} from "./fixture.meta.mjs";
      let uninstalled = false;
      try { Runtime.resolve("Example"); } catch { uninstalled = true; }
      Runtime.install(meta);
      console.log(JSON.stringify([uninstalled, meta.classes.Example.constructor === Example,
        new Example().label]));
    JS
  ensure
    modules&.each_key { |name| File.delete("build/#{name}") if File.exist?("build/#{name}") }
  end

  def test_proto_is_an_ordinary_metadata_key
    js = javascript('property :__proto__, type: String, default: "safe"') + <<~JS
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify(Runtime.read(object, "__proto__")));
    JS
    assert_equal "safe", execute(js)
  end

  def test_sorbet_rejects_wrong_generated_writer_type_and_computed_return
    path = "build/negative_typecheck.rb"
    compiler = compile("property :label, type: String do\n42\nend")
    File.write(path, <<~RUBY + compiler.type_probes.lines.drop(2).join)
      # typed: true
      Demo::Person.new.name = 42
    RUBY
    output, status = Open3.capture2e("bundle", "exec", "srb", "tc", path)
    refute status.success?, output
    assert_includes output, "Expected `String`"
    assert_includes output, "__spike_check_label"
  ensure
    File.delete(path) if File.exist?(path)
  end

  private

  def execute(js)
    path = "build/compiler-test.mjs"
    File.write(path, js)
    output, status = Open3.capture2e("node", path)
    assert status.success?, output
    JSON.parse(output)
  ensure
    File.delete(path) if File.exist?(path)
  end
end
