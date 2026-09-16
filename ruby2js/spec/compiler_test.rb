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

  def test_dom_typed_source_compiles_to_native_calls
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add(<<~RUBY)
      class BrowserView
        extend T::Sig
        sig { params(element: Element).void }
        def initialize(element)
          super()
          @element = element
          @listener = T.let(nil, T.untyped)
        end

        sig { void }
        def wire
          @element.addEventListener("click") { |event| event.preventDefault }
        end

        sig { params(callback: T.proc.params(event: Event).void, event: Event).void }
        def notify(callback, event)
          callback.(event)
          @listener.call(event)
        end
      end
    RUBY
    js = compiler.javascript(runtime: "./runtime.mjs")
    assert_includes js, "constructor(element)"
    assert_match(/this\._element\.addEventListener\(\s*"click"/, js)
    assert_includes js, "event.preventDefault()", "a native callback's parameter is typed by the DOM table"
    assert_includes js, "callback(event)"
    assert_includes js, "this._listener.call(null, event)"
    refute_includes js, "Runtime.read"
  end

  def test_binding_and_action_dom_behavior_is_compiled_from_framework_ruby
    compiler = Swill::Ruby2JS::Compiler.new
    Swill::Ruby2JS::FRAMEWORK_SOURCES.each do |path|
      compiler.add(File.read(path), file: path)
    end

    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "class Swill__Bindings extends Swill__Object"
    assert_includes js, "class Swill__Controller__List extends Swill__Controller", "a class nested under a class compiles"
    assert_match(/new Swill__Bindings\(\)\.wireObject\(\s*item,\s*element\s*\)/, js)
    assert_match(/new Swill__Actions\(\)\.wireInto\(\s*this,\s*element\s*\)/, js)
    assert_includes js, "Runtime.observePath(object, path, render)"
    assert_includes js, "Runtime.isTruthy(value)"
    assert_includes js, "element.addEventListener(event_name, handler)"
    assert_includes js, "class Swill__Actions extends Swill__Object"
    assert_includes js, "controller.performAction(action_name, element, event)"
    assert_includes js, "new Swill__Bindings().wire(controller)"
    assert_includes js, "new Swill__Actions().wire(controller)"
    assert_match(/document\.addEventListener\(\s*"DOMContentLoaded"/, js)
    assert_includes js, "if (!event.persisted) return application.terminate()"
    modules = compiler.modules(name: "fixture", runtime: "../lib/swill/runtime.mjs", publish: "Swill", launch: "Swill::Launcher")
    entry = modules.fetch("fixture.mjs")
    assert_includes entry, "if (typeof document !== \"undefined\")"
    assert_includes entry, 'new (Runtime.resolve("Swill::Launcher"))().install(document)'
    assert_raises(Swill::Ruby2JS::CompileError) do
      compiler.modules(name: "fixture", runtime: "../lib/swill/runtime.mjs", launch: "Swill::Launcher")
    end
  end

  # Sorbet's runtime operations compile to checks with sorbet-runtime's
  # behavior and give the typer facts. The fixture runs on MRI (which has
  # sorbet-runtime) and as JavaScript; results and failures must agree.
  SORBET_OPERATIONS = <<~'RUBY'
    class Person < TestObject
      extend T::Sig
      property :name, type: String, default: ""
      sig { returns(String) }
      def greeting; "Hi #{name}"; end
    end

    class Holder < TestObject
      extend T::Sig
      property :person, type: T.nilable(Person), default: nil

      sig { returns(String) }
      def must_greeting; T.must(person).greeting; end

      sig { params(value: T.untyped).returns(String) }
      def cast_name(value); T.cast(value, Person).name; end

      sig { params(value: T.untyped).returns(Integer) }
      def let_count(value)
        items = T.let(value, T::Array[String])
        items << "x"
        items.length
      end

      sig { params(value: T.untyped).returns(T.nilable(String)) }
      def nilable_cast(value); T.cast(value, T.nilable(String)); end

      sig { params(value: T.untyped).returns(T.untyped) }
      def unsafe_length(value); T.unsafe(value).length; end

      sig { params(flag: T::Boolean).returns(String) }
      def either(flag)
        case flag
        when true then "yes"
        when false then "no"
        else T.absurd(flag)
        end
      end
    end
  RUBY

  def test_sorbet_runtime_operations_are_lowered_checked_and_typed
    js = compiler_with_test_object.add(SORBET_OPERATIONS).javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "Runtime.must(this.person).greeting()", "T.must strips nilability, so the call is direct"
    assert_includes js, 'Runtime.cast(value, "Person").name', "T.cast types the receiver as the class"
    assert_includes js, 'items = Runtime.cast(value, "T::Array[String]")'
    assert_includes js, 'Runtime.append(items, "x")', "a T.let local is typed from its declaration"
    assert_includes js, 'Runtime.read(value, "length")', "T.unsafe forgets the type; the send is dynamic"
    assert_includes js, "Runtime.absurd(flag)"
    refute_match(/\bT\.(?:must|cast|let|unsafe|absurd)\(/, js, "no sorbet-runtime call survives")
    javascript_result = execute(js + <<~JS)
      const holder = new (Runtime.resolve("Holder"))();
      const person = new (Runtime.resolve("Person"))();
      person.name = "Ada";
      holder.person = person;
      const failures = [];
      for (const attempt of [() => { holder.person = null; holder.mustGreeting(); },
                             () => holder.castName("Ada"), () => holder.letCount("Ada"),
                             () => holder.nilableCast(3)]) {
        try { attempt(); failures.push(null); } catch (error) { failures.push(error.constructor.name); }
      }
      holder.person = person;
      console.log(JSON.stringify([holder.mustGreeting(), holder.castName(person), holder.letCount(["a"]),
        holder.nilableCast(null), holder.unsafeLength("abc"), holder.either(false), failures]));
    JS
    ruby, status = Open3.capture2e("ruby", "-rjson", "-r./spec/mri_adapter", "-e", <<~RUBY)
      class TestObject < Swill::Object; end
      #{SORBET_OPERATIONS}
      holder = Holder.new
      person = Person.new
      person.name = "Ada"
      holder.person = person
      failures = [-> { holder.person = nil; holder.must_greeting }, -> { holder.cast_name("Ada") },
                  -> { holder.let_count("Ada") }, -> { holder.nilable_cast(3) }].map do |attempt|
        attempt.call
        nil
      rescue TypeError
        "TypeError"
      end
      holder.person = person
      puts JSON.generate([holder.must_greeting, holder.cast_name(person), holder.let_count(["a"]),
        holder.nilable_cast(nil), holder.unsafe_length("abc"), holder.either(false), failures])
    RUBY
    assert status.success?, ruby
    assert_equal JSON.parse(ruby), javascript_result
  end

  # An untyped receiver is dispatched by Ruby name at run time, whatever
  # the form of the send; is_a? is JavaScript's instanceof.
  def test_ruby_queries_dup_and_warn_dispatch_dynamically_on_untyped_receivers
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add(<<~'RUBY')
      class Probe
        def go(x)
          warn("oops #{x}")
          [x.dirty?, x.nil?, x.empty?, x.respond_to?(:draft), x.dup, x.is_a?(Probe), x.between?(1, 2),
           x.index(1), x.first, x.to_s, x.some_member(), x.some_property, x.other_property = 1]
        end
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "Runtime.warn(`oops ${x}`)"
    assert_includes js, 'Runtime.read(x, "dirty?")'
    assert_match(/x ===? null/, js)
    assert_includes js, 'Runtime.read(x, "empty?")'
    assert_includes js, 'Runtime.respondsTo(x, "draft")'
    assert_includes js, 'Runtime.read(x, "dup")'
    assert_includes js, "x instanceof Probe"
    assert_includes js, 'Runtime.invoke(x, "between?", 1, 2)'
    assert_includes js, 'Runtime.invoke(x, "index", 1)', "a Ruby core method JavaScript lacks keeps Ruby's meaning"
    assert_includes js, 'Runtime.read(x, "first")'
    assert_includes js, 'Runtime.read(x, "to_s")'
    assert_includes js, 'Runtime.read(x, "some_member")', "a zero-argument send reads through metadata, method or property"
    assert_includes js, 'Runtime.read(x, "some_property")'
    assert_includes js, 'Runtime.write(x, "other_property", 1)'
    shared = javascript("def go; warn(\"shared\"); end")
    assert_includes shared, 'Runtime.warn("shared")'
    own = javascript("def warn(message); message; end\ndef go; warn(\"mine\"); end")
    assert_includes own, 'this.warn("mine")', "an entry's own warn is a method call"
  end

  def test_class_methods_compile_to_statics_where_new_is_the_class
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Registry < TestObject
        extend T::Sig
        property :tag, type: String, default: ""
        sig { params(value: String).returns(Registry) }
        def self.make_one(value)
          one = new
          one.tag = value
          one
        end
        sig { params(items: T::Array[String]).returns(T.nilable(String)) }
        def self.first_of(items)
          items.first
        end
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "static makeOne(value) {"
    assert_includes js, "let one = new this();"
    assert_includes js, "static firstOf(items) {"
    assert_equal ["x", "a", nil], execute(js + <<~JS)
      const registry = Runtime.resolve("Registry");
      console.log(JSON.stringify([registry.makeOne("x").tag, registry.firstOf(["a", "b"]), registry.firstOf([])]));
    JS
    surface = Swill::Ruby2JS::Compiler.new
    surface.add(<<~RUBY)
      class Leaf
        extend T::Sig
        sig { params(element: Element).returns(T.untyped) }
        def self.of(element); element.__swill_view__; end
        sig { params(node: Element).returns(T.untyped) }
        def self.find_root(node); Leaf.of(node); end
      end
    RUBY
    js = surface.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "static of(element) {"
    assert_includes js, "static findRoot(node) {"
    assert_includes js, "return Leaf.of(node);"
    error = assert_raises(Swill::Ruby2JS::CompileError) { javascript("def self.new; end") }
    assert_includes error.message, "unsupported method definition self.new"
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add("module Helper\ndef self.go; end\nend").javascript(runtime: "../lib/swill/runtime.mjs")
    end
    assert_includes error.message, "included"
  end

  # A receiver whose class is known gets Ruby calls and property access from
  # the compiler's knowledge, not from parentheses; a DOM-typed receiver is
  # native, with the DOM table deciding listed members and the source's
  # parentheses deciding unlisted ones.
  def test_typed_receivers_resolve_from_knowledge_and_dom_receivers_from_the_table
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add(<<~RUBY)
      class Widget
        extend T::Sig
        property :count, type: Integer, default: 0
        sig { returns(Integer) }
        def tally; count; end
        sig { params(element: Element).returns(T.nilable(Widget)) }
        def self.of(element); element.__widget__; end
      end
      class Holder
        extend T::Sig
        sig { params(element: Element).void }
        def initialize(element)
          super()
          @widget = Widget.new
          @element = element
        end
        sig { params(other: Widget, node: Element).returns(T.untyped) }
        def go(other, node)
          found = Widget.of(node)
          other.count = other.tally
          @widget.count = @widget.tally + found.tally
          @element.tally()
          [other.count, found.count, node.parentElement, node.tally(), node.tally, other.next_widget]
        end
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "other.count = other.tally();", "a typed parameter: property write and a call without parentheses"
    assert_includes js, "this._widget.count = this._widget.tally() + found.tally();", "an ivar assigned one class, and a local typed by a static method's signature"
    assert_includes js, "this._element.tally();", "a DOM-typed ivar is native"
    assert_includes js, "found.count,", "a declared property reads"
    assert_includes js, "      node.parentElement,\n      node.tally(),\n      node.tally,\n", "a listed DOM member reads; an unlisted one follows the parentheses"
    assert_includes js, "other.nextWidget()", "a member the class does not declare falls back to an explicit call"
  end

  def test_sorbet_runtime_operations_type_their_results
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add("class Leaf\nextend T::Sig\nsig { returns(Integer) }\ndef size; 1; end\nend\nclass Holder\ndef pick(value, node); T.cast(value, Leaf).size; T.must(node).size; end\nend")
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, 'Runtime.cast(value, "Leaf").size()', "a cast receiver calls its collected method"
    assert_includes js, 'Runtime.read(Runtime.must(node), "size")', "an untyped receiver stays dynamic after T.must"
  end

  # On a Ruby receiver a csend would reach the send lowerings and come out
  # as a plain call; on a DOM receiver ?. is JavaScript's own.
  def test_safe_navigation_is_rejected_on_ruby_receivers_and_native_on_dom_ones
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      javascript("extend T::Sig\nproperty :other, type: T.nilable(Example), default: nil\nsig { returns(T.untyped) }\ndef go; other&.go; end")
    end
    assert_includes error.message, "safe navigation (&.) is not lowered on a Ruby receiver"
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add("class Leaf\nextend T::Sig\nsig { params(other: T.nilable(Element)).void }\ndef go(other); other&.remove(); end\nend")
    assert_includes compiler.javascript(runtime: "../lib/swill/runtime.mjs"), "other?.remove()"
  end

  def test_other_sorbet_constructs_and_uncheckable_types_are_rejected
    [
      ["def name; T::Struct.new; end", "unsupported runtime Sorbet construct T::Struct"],
      ["def name; T.reveal_type(1); end", "unsupported runtime Sorbet construct T"],
      ["def name; T.must(1, 2); end", "T.must takes 1 argument(s), not 2"],
      ["def name; T.cast(1, T.any(String, Integer)); end", "unsupported type in T.cast: T.any(String, Integer)"],
      ["def name; T.let(1, Missing); end", "T.let to Missing: not a class the runtime can check"],
      ["def name; T.cast(1, Comparable); end", "T.cast to Comparable: not a class the runtime can check"]
    ].each do |body, message|
      error = assert_raises(Swill::Ruby2JS::CompileError, body) { javascript(body) }
      assert_includes error.message, message
    end
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add("module Tracking; end\nclass Example < TestObject\ndef name(value); T.cast(value, Tracking); end\nend")
        .javascript(runtime: "../lib/swill/runtime.mjs")
    end
    assert_includes error.message, "T.cast to Tracking: a mixin is not checkable"
  end

  def test_outlet_types_name_the_value_and_resolve_to_installed_classes
    compiler = compiler_with_test_object.add(<<~RUBY)
      module Demo
        class Person < TestObject; end
        class Host < TestObject
          extend T::Sig
          outlet :seed, type: T::Hash[String, String]
          outlet :rows, type: T::Array[Hash], optional: true
          outlet :owner, type: Person
          sig { returns(String) }
          def seeded; T.must(seed).fetch("name"); end
        end
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, 'Runtime.fetch(Runtime.must(this.seed), "name")', "the outlet reads as its declared type"
    assert_match(/"seed": \{\s*type: "T\.nilable\(T::Hash\[String, String\]\)"/, js)
    assert_match(/"owner": \{\s*type: "T\.nilable\(Demo::Person\)"/, js, "a class type is resolved to its installed name")
    assert_includes compiler.rbi, "sig { returns(T.nilable(T::Hash[String, String])) }"
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add("module Tracking; end\nclass Example < TestObject\noutlet :seed, type: Tracking\nend")
        .javascript(runtime: "../lib/swill/runtime.mjs")
    end
    assert_includes error.message, "outlet seed: Tracking is not a class"
  end

  def test_dynamic_declarations_and_mutable_defaults_are_rejected
    ['property field, type: String', 'property :names, type: T::Array[String], default: [1]',
     'property :name, type: String, nonsense: true', 'prepend Other'].each do |body|
      assert_raises(Swill::Ruby2JS::CompileError) { javascript(body) }
    end
  end

  def test_attribute_requires_an_explicit_default
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      javascript("attribute :name, type: String")
    end
    assert_equal "attribute declaration requires default:", error.message
  end

  def test_missing_include_and_reopened_class_are_rejected
    assert_raises(Swill::Ruby2JS::CompileError) { javascript("include Missing") }
    compiler = compile("")
    assert_raises(Swill::Ruby2JS::CompileError) { compiler.add("class Example < TestObject; end") }
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
      assert_raises(Swill::Ruby2JS::CompileError) do
        Swill::Ruby2JS::Compiler.new.add("module Feature\ndef self.included(base)\n#{body}\nend\nend")
      end
    end
    assert_raises(Swill::Ruby2JS::CompileError) do
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
      const before = [[...first.names], first.isAny];
      first.add("Ada");
      console.log(JSON.stringify([...before, first.names, first.isAny, second.names.length === 0, second.lookup]));
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
    application = Swill::Ruby2JS::Compiler.new(imports: framework.knowledge.interface).add(<<~RUBY)
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
      assert_raises(Swill::Ruby2JS::CompileError) do
        Swill::Ruby2JS::Compiler.new.add(<<~RUBY)
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
      console.log(JSON.stringify([object.label(), object.helperLabel(), object.recordLabel()]));
    JS
    assert_equal ["feature", "helper", "record"], execute(js)
  end

  def test_unsupported_reflection_is_a_build_error
    %w[public_send const_get define_method instance_exec].each do |method|
      assert_raises(Swill::Ruby2JS::CompileError) { javascript("def read(value); #{method}(value); end") }
    end
  end

  def test_forward_superclasses_and_duplicate_inherited_includes_are_rejected
    source = "class Child < Parent; end\nclass Parent < TestObject; end"
    assert_raises(Swill::Ruby2JS::CompileError) { compiler_with_test_object.add(source).javascript(runtime: "./runtime.mjs") }
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
    assert_raises(Swill::Ruby2JS::CompileError) { compiler_with_test_object.add(source).javascript(runtime: "./runtime.mjs") }
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
      console.log(JSON.stringify([example.readers("Ada", [], null), example.dynamicReaders(""), example.dynamicReaders(null)]));
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
    assert_includes js, "other === this.maybeObject"
    assert_includes js, 'items || "never"'
    # Signature return types and interpolation make later reads static.
    assert_includes js, "Runtime.upcase(this.baseLabel())"
    assert_includes js, "Runtime.downcase(interpolated)"
    # Boolean operands need logical ||; nullish ?? would keep Ruby's false.
    assert_includes js, 'flag || "yes"'
    assert_equal ["yes", true, ["ADA", "ada!"]], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify([object.either(false), object.either(true), object.derivedLabel()]));
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

  # One fixture over the core type tables, run on MRI and as compiled
  # JavaScript; the two results must be the same JSON.
  CORE_TYPES = <<~'RUBY'
    class Core < TestObject
      extend T::Sig

      sig { params(text: String, maybe: T.nilable(String)).returns(T::Array[T.untyped]) }
      def strings(text, maybe)
        [text.to_s, text.length, text.size, text.include?("ra"), text.start_with?("G"), text.end_with?("z"),
         text.to_i, "  12abc".to_i, "abc".to_i, "3.5kg".to_f, text.capitalize, text.chars, "  a  b ".split,
         "a,b,,".split(","), text.slice(1, 3), text.slice(-2, 2), text.slice(0), text.slice(9, 1),
         text.upcase.downcase, text.strip.empty?, text.dup, maybe.to_s, maybe.blank?, text.to_sym.to_s]
      end

      sig { params(number: Integer, other: Integer, ratio: Float).returns(T::Array[T.untyped]) }
      def numbers(number, other, ratio)
        [number.to_s, number.zero?, number.positive?, number.negative?, number.even?, number.odd?, number.abs,
         number.clamp(0, 5), number.between?(1, 10), number / other, number % other, -7 / 2, -7 % 2,
         ratio.floor, ratio.ceil, ratio.round, ratio.to_i, ratio.to_s, true.to_s, nil.to_s, nil.to_a, nil.to_i]
      end

      sig { params(items: T::Array[Integer], words: T::Array[String]).returns(T::Array[T.untyped]) }
      def arrays(items, words)
        copy = items.dup
        copy << 4
        copy.push(5)
        copy.unshift(0)
        popped = copy.pop
        shifted = copy.shift
        [items.count, items.first, items.last, items.index(3), items.index(99), items.reverse, items.sort,
         items.uniq, [1, nil, 2].compact, items.sum, items.min, items.max, [].min, items.take(2), items.drop(2),
         words.join, words.join("-"), items + [9], items - [1, 3], [[1, [2]], 3].flatten, copy, popped, shifted,
         items, items.reject { |n| n > 2 }, items.find { |n| n > 1 }, items.detect { |n| n > 9 },
         items.any? { |n| n > 5 }, items.all? { |n| n > 0 }, items.none? { |n| n > 5 }, items.count { |n| n.odd? },
         items.sort_by { |n| -n }, items.flat_map { |n| [n, n * 10] }, items.min_by { |n| -n },
         items.max_by { |n| -n }, words.select { |word| word.length }, indexed(words),
         words.map { |word| word.upcase }]
      end

      sig { params(words: T::Array[String]).returns(T::Array[String]) }
      def indexed(words)
        pairs = []
        words.each_with_index { |word, index| pairs << "#{index}:#{word}" }
        pairs
      end

      sig { params(table: T::Hash[String, Integer]).returns(T::Array[T.untyped]) }
      def hashes(table)
        copy = table.dup
        removed = copy.delete("a")
        missing = copy.delete("zz")
        [table.size, table.key?("a"), table.has_key?("zz"), table.include?("b"), table.keys, table.values,
         table.fetch("a"), table.fetch("zz", 0), table.merge({"c" => 3}), table.empty?, {}.empty?, {}.blank?,
         table.present?, copy, removed, missing, table.select { |key, value| value > 1 },
         table.reject { |key, value| value > 1 }, table.map { |key, value| "#{key}=#{value}" },
         table.any? { |key, value| value > 1 }, table.all? { |key, value| value > 5 },
         table.count { |key, value| value.odd? }, counted(table)]
      end

      sig { params(table: T::Hash[String, Integer]).returns(Integer) }
      def counted(table)
        total = 0
        table.each { |key, value| total = total + value }
        total
      end
    end
  RUBY

  def test_core_type_methods_agree_with_mri
    js = compiler_with_test_object.add(CORE_TYPES).javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes js, "Runtime.intDiv(number, other)"
    assert_includes js, "Runtime.append(copy, 4)"
    assert_includes js, 'Runtime.split("  a  b ")'
    assert_includes js, "Object.entries(table).forEach(([key, value]) =>"
    assert_includes js, "Object.fromEntries(Object.entries(table).filter(([key, value]) => value > 1))"
    assert_includes js, "words.filter((word) => word.length != null)", "Ruby truthiness decides a filter, not JavaScript's"
    assert_includes js, "Runtime.stringify(maybe)", "to_s on a possibly nil receiver is nil-safe"
    javascript_result = execute(js + <<~JS)
      const core = new (Runtime.resolve("Core"))();
      console.log(JSON.stringify([core.strings("Grace", null), core.numbers(7, -2, 2.5),
        core.arrays([3, 1, 2], ["b", "", "a"]), core.hashes({a: 1, b: 2})]));
    JS
    # The MRI adapter supplies blank? and present?, as the runtime does in JS.
    ruby, status = Open3.capture2e("ruby", "-rjson", "-r./spec/mri_adapter", "-e", <<~RUBY)
      class TestObject; end
      #{CORE_TYPES}
      core = Core.new
      puts JSON.generate([core.strings("Grace", nil), core.numbers(7, -2, 2.5),
        core.arrays([3, 1, 2], ["b", "", "a"]), core.hashes({"a" => 1, "b" => 2})])
    RUBY
    assert status.success?, ruby
    assert_equal JSON.parse(ruby), javascript_result
  end

  def test_core_type_methods_outside_the_tables_are_rejected_at_build_time
    [
      ["sig { params(text: String).void }\ndef go(text); text.center(3); end", "no lowering for String#center"],
      ["sig { params(n: Integer).void }\ndef go(n); n.digits; end", "no lowering for Integer#digits"],
      ["sig { params(items: T::Array[String]).void }\ndef go(items); items.each_slice(2) { |a| a }; end", "no lowering for T::Array[String]#each_slice with a block"],
      ["sig { params(table: T::Hash[String, Integer]).void }\ndef go(table); table.dig(\"a\"); end", "no lowering for T::Hash[String, Integer]#dig"],
      ["sig { params(text: String).void }\ndef go(text); text.include?; end", "String#include? takes 1 argument(s), not 0"]
    ].each do |body, message|
      error = assert_raises(Swill::Ruby2JS::CompileError, body) { javascript("extend T::Sig\n#{body}") }
      assert_includes error.message, message
    end
    # Operators, indexing, and pragma-typed sends stay with the converter.
    js = javascript("extend T::Sig\nsig { params(text: String, items: T::Array[Integer]).returns(T.untyped) }\ndef go(text, items); [text + \"!\", text[0], items[1], text.dup]; end")
    assert_includes js, 'text + "!"'
    assert_includes js, "items[1]"
  end

  def test_untyped_receivers_dispatch_through_installed_metadata
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Person < TestObject
        extend T::Sig
        property :name, type: String, default: "Ada"
        sig { params(prefix: String).returns(String) }
        def greet(prefix); "\#{prefix} \#{name}"; end
        def initials; name.slice(0, 1); end
      end
      class Caller < TestObject
        def read_name(thing); thing.name; end
        def write_name(thing); thing.name = "Grace"; end
        def greet(thing); thing.greet("Hello"); end
        def plain_call(thing); thing.initials; end
        def constructed
          person = Person.new
          person.greet("Hi")
        end
        def native(value); value[0] + value.length; end
      end
    RUBY
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs")
    # Nothing about an untyped receiver is decided by name: every send is
    # resolved through metadata at run time, as Ruby itself would resolve it.
    assert_includes js, 'Runtime.read(thing, "name")'
    assert_includes js, 'Runtime.write(thing, "name", "Grace")'
    assert_includes js, 'Runtime.invoke(thing, "greet", "Hello")'
    assert_includes js, 'Runtime.read(thing, "initials")'
    assert_includes js, 'person.greet("Hi")', "constructing a collected class types the local"
    assert_includes js, 'value[0] + Runtime.read(value, "length")', "indexing and operators stay native; length is a value reader"
    assert_equal ["Ada", "Grace", "Hello Grace", "G", "Hi Ada", 3, "Unknown method or wrong arity: greet", "plain"], execute(js + <<~JS)
      const caller = new (Runtime.resolve("Caller"))();
      const person = new (Runtime.resolve("Person"))();
      const results = [caller.readName(person)];
      caller.writeName(person);
      results.push(person.name, caller.greet(person), caller.plainCall(person), caller.constructed(), caller.native([1, 2]));
      try { caller.greet({}); } catch (error) { results.push(error.message); }
      results.push(caller.readName({name: "plain"}), "a plain object is a Hash: reads are key-value coding");
      results.pop();
      console.log(JSON.stringify(results));
    JS
  end

  def test_callables_are_invoked_with_their_arguments
    js = javascript(<<~'RUBY')
      extend T::Sig
      sig { params(callback: T.untyped, list: T::Array[Integer]).returns(T::Array[Integer]) }
      def run(callback, list)
        local = ->(value) { value * 2 }
        results = [callback.call(1), callback.(2), local.(3), @stored.call(4)]
        list.each { |item| results.push(callback.call(item)) }
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
    assert_includes js, "Runtime.append(results, callback(item))", "push returns the array, as in Ruby"
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
    compiler.add(<<~RUBY)
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
      "class Host < Swill::Controller\noutlet :field, type: Swill::View, key: :x\nend"
    ].each do |body|
      assert_raises(Swill::Ruby2JS::CompileError, body) do
        Swill::Ruby2JS::Compiler.new.add(framework).add(body).javascript(runtime: "./runtime.mjs")
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
    compiler = Swill::Ruby2JS::Compiler.new.add(framework).add(<<~RUBY)
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
    host = ->(body) do
      Swill::Ruby2JS::Compiler.new.add(framework)
        .add("class Host < Swill::Controller\nproperty :query, type: String, default: \"\"\nproperty :flag, type: T::Boolean, default: false\n#{body}\nend")
    end
    # The declaration's shape is the compiler's; what it names is checked by
    # the runtime when the bundle installs.
    ["restorable query", "restorable :query, codec: :string", "restorable \"query.\""].each do |body|
      assert_raises(Swill::Ruby2JS::CompileError, body) { host.(body).javascript(runtime: "./runtime.mjs") }
    end
    assert_includes execute_failing(host.("restorable :missing").javascript(runtime: "../lib/swill/runtime.mjs")),
      "Restorable path must start with a declared property: missing"
    assert_includes execute_failing(host.("restorable :query, key: :q\nrestorable :flag, key: :q").javascript(runtime: "../lib/swill/runtime.mjs")),
      "Duplicate restorable key: q"
  end

  # The compiler emits what the source says; the runtime refuses what its
  # property protocol cannot honor when the bundle installs.
  def test_property_protocol_conflicts_fail_at_installation_not_compilation
    js = javascript("property :count, type: Integer, default: 0\ndef count=(value); end")
    assert_includes js, "set count(value)"
    assert_includes execute_failing(js), "Setter method for declared property: count"
    js = compiler_with_test_object
      .add("class Base < TestObject\nproperty :count, type: Integer, default: 0\nend")
      .add("class Sub < Base\ndef count=(value); end\nend")
      .javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes execute_failing(js), "Setter method for declared property: count"
    # Mutation hooks are the accepted form, on stored and computed properties.
    js = javascript(<<~RUBY)
      property :count, type: Integer, default: 0
      property :total, type: Integer do
        count * 2
      end
      def count_did_change(previous, value); end
      def total_did_change(previous, value); end
    RUBY
    assert_equal [1, [["total", 0, 2], ["count", 0, 1]]], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      const seen = [];
      object.countDidChange = (previous, value) => seen.push(["count", previous, value]);
      object.totalDidChange = (previous, value) => seen.push(["total", previous, value]);
      object.count = 1;
      console.log(JSON.stringify([object.count, seen]));
    JS
  end

  # The browser's intrinsics and DOM classes pass through by name on either
  # surface; a source constant of the same name still wins, encoded so it
  # cannot shadow the global.
  def test_javascript_intrinsics_and_dom_classes_pass_through_by_name
    js = javascript("extend T::Sig\nsig { params(text: String).returns(T.untyped) }\ndef parse(text); JSON.parse(text); end")
    assert_includes js, "JSON.parse(text)"
    js = Swill::Ruby2JS::Compiler.new
      .add("class JSON\ndef parse(text); text; end\nend\nclass Decoder\ndef parse(text); JSON.new.parse(text); end\nend")
      .javascript(runtime: "./runtime.mjs")
    assert_includes js, "new Ruby_JSON().parse(text)"
    error = assert_raises(Swill::Ruby2JS::CompileError) { javascript("def go; Nope.parse(1); end") }
    assert_includes error.message, "unknown constant Nope"
  end

  def test_constructors_taken_from_call_results_are_parenthesized
    shared = compiler_with_test_object
      .add("class Registry < TestObject\ndef lookup(name); TestObject; end\nend")
      .add("class Example < TestObject\ndef make(registry); registry.lookup(\"x\").new(1); end\ndef plain; TestObject.new; end\nend")
      .javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes shared, 'new (Runtime.invoke(registry, "lookup", "x"))(1)'
    assert_includes shared, "new TestObject()"
    assert_equal true, execute(shared + <<~JS)
      const made = new (Runtime.resolve("Example"))().make(new (Runtime.resolve("Registry"))());
      console.log(JSON.stringify(made instanceof Runtime.resolve("TestObject")));
    JS
    browser = Swill::Ruby2JS::Compiler.new
      .add("class Maker\ndef make(name, element); Runtime.resolve(name).new(element); end\nend")
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
    RUBY
    assert_includes js, "people.forEach((person) => {"
    assert_includes js, 'Runtime.respondsTo(person, "label")'
    assert_includes js, "Runtime.append(seen, person.label())", "block parameters take the element type"
    assert_includes js, "words.map((word) => Runtime.upcase(word))"
    assert_includes js, "words.filter((word) => Runtime.isEmpty(Runtime.strip(word)))"
    assert_includes js, 'words.includes("Ada")'
    assert_includes js, "words.length"
    assert_includes js, "words[0]"
    assert_includes js, "words.at(-1)"
    assert_includes js, 'Runtime.respondsTo(this, "survey")'
    error = assert_raises(Swill::Ruby2JS::CompileError) { javascript("def untyped(things); things.each { |thing| thing }; end") }
    assert_includes error.message, "block call each on an untyped receiver; give things a static type"
    assert_raises(Swill::Ruby2JS::CompileError) { javascript("def ask(name); respond_to?(name); end") }
    assert_equal [["labelled"], ["ADA", " "], [" "], true, 2, "Ada", " ", true, false], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify(object.survey([object, {}], ["Ada", " "])));
    JS
  end

  def test_raise_produces_error_objects_and_rejects_other_forms
    js = javascript('def boom; raise "nope"; end')
    assert_includes js, 'throw new Error("nope")'
    assert_raises(Swill::Ruby2JS::CompileError) { javascript("def boom(value); raise value; end") }
    assert_raises(Swill::Ruby2JS::CompileError) { javascript("def boom; raise; end") }
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
      console.log(JSON.stringify([object.copyArray(array), object.copyHash(hash),
        object.keys(hash), object.inferred(), object.arithmetic([3]), object.copy,
        object.copyArray(array) !== array, object.copyHash(hash) !== hash]));
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
      error = assert_raises(Swill::Ruby2JS::CompileError) do
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
    assert_match(/typedName\(other\) \{\s*return other\.name;/, js)
    assert_match(/typedRename\(other, value\) \{\s*return other\.name = value;/, js)
    assert_match(/nilableName\(other\) \{\s*return other\.name;/, js)
    assert_includes js, 'Runtime.write(other, "name", value)'
    js += <<~JS
      const method = new (Runtime.resolve("MethodOwner"))();
      const property = new (Runtime.resolve("PropertyOwner"))();
      method.typedRename(property, "typed");
      const typed = property.name;
      method.untypedRename(property, "untyped");
      let rejected;
      try { method.untypedRename(method, "x"); } catch (error) { rejected = error.message; }
      console.log(JSON.stringify([method.ownName(), method.otherName(method), method.otherName(property),
        method.typedName(property), typed, property.name, rejected]));
    JS
    assert_equal ["method", "method", "untyped", "untyped", "typed", "untyped", "Unknown writer: name"], execute(js)
  end

  def test_identifier_encoding_does_not_conflate_namespace_and_underscores
    assert_equal "Record", Swill::Ruby2JS::Knowledge.identifier("Record")
    assert_equal "Demo__Person", Swill::Ruby2JS::Knowledge.identifier("Demo::Person")
    refute_equal Swill::Ruby2JS::Knowledge.identifier("A::B"), Swill::Ruby2JS::Knowledge.identifier("A__B")
    names = %w[A::B A__B A_uB A_u::B Runtime Ruby_Runtime Superclass Ruby_Superclass]
    assert_equal names.length, names.map { |name| Swill::Ruby2JS::Knowledge.identifier(name) }.uniq.length
  end

  def test_readable_class_headers_and_reference_based_wiring
    framework = Swill::Ruby2JS::Compiler.new
      .add(File.read("lib/swill/core/observable.rb"))
      .add(File.read("lib/swill/core/object.rb"))
      .add(File.read("lib/swill/model/attributes.rb"))
      .add(File.read("lib/swill/model/dirty_tracking.rb"))
      .add(File.read("lib/swill/model/drafts.rb"))
      .add(File.read("lib/swill/model/base.rb"))
    compiler = Swill::Ruby2JS::Compiler.new(imports: framework.knowledge.interface)
    compiler.add(File.read("examples/models.rb"))
    js = compiler.javascript(runtime: "../lib/swill/runtime.mjs", framework: "./framework.mjs")
    assert_includes js, "class Demo__Person extends Swill__Model__Base {"
    assert_includes js, "export { Demo__Person };"
    assert_includes js, "mixins: [NormalizeName, StripName, DecorateName]"
    assert_includes js, "constructor: Demo__Person"
    refute_includes js, "Runtime.include("
    refute_match(/class Generated|extends .*?\(|^\s*;\s*$/, js)
    assert_includes js, '"name": {'
    assert_includes js, "function computeLabel()"
    assert_includes js, "Runtime.strip(super.normalize(value))"
    framework_js = framework.javascript(runtime: "../lib/swill/runtime.mjs")
    assert_includes framework_js, "let copy = new this.constructor"
    refute_includes framework_js, "Runtime.draft("
    assert_equal js, Swill::Ruby2JS::Compiler.format_javascript(js)
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
      console.log(JSON.stringify([object.make().label(), object.makeRuntime().label()]));
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

  # The bundle's own failure output, for checks that must fail at load time.
  def execute_failing(js)
    path = "build/compiler-test.mjs"
    File.write(path, js)
    output, status = Open3.capture2e("node", path)
    refute status.success?, "expected the bundle to fail while installing"
    output
  ensure
    File.delete(path) if File.exist?(path)
  end
end
