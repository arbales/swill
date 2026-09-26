require "minitest/autorun"
require "open3"
require "tmpdir"
require_relative "../rb/compiler/compiler"

class CompilerTest < Minitest::Test
  # A miniature of the framework: the observation hooks a declared property
  # calls, and two declaration macros of its own. A fixture declares its own
  # macros the same way a plugin would.
  TEST_OBJECT = <<~RUBY
    module Swill
      class Object
        extend T::Sig
        def coerce_property_value(name, value, previous); value; end
        def property_will_change(name, previous, value); end
        def property_will_access(name); end
      end
    end
    class TestObject < Swill::Object
      macro def self.outlet(name, type:, optional: false, &computed)
        property name, type: Swill::Runtime.optional_type(type), default: nil,
                       outlet: true, optional: optional, &computed
      end

      macro def self.restorable(path, key: path)
        declare_restoration(path, key: key)
      end
    end
  RUBY

  def compiler_with_test_object
    Swill::Ruby2JS::Compiler.new.add(TEST_OBJECT)
  end

  def compile(body)
    compiler_with_test_object.add("class Example < TestObject\n#{body}\nend")
  end

  def javascript(body)
    compile(body).javascript(runtime: "../rb/runtime/runtime.mjs")
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

  def test_override_inherits_dom_parameter_types
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add(<<~RUBY)
      class Responder
        extend T::Sig
        sig { params(event: KeyboardEvent).void }
        def key_down(event); end
      end
      class SearchField < Responder
        def key_down(key_event)
          key_event.preventDefault if key_event.key == "ArrowDown"
        end
      end
    RUBY
    js = compiler.javascript(runtime: "./runtime.mjs")
    assert_includes js, 'key_event.key === "ArrowDown"'
    assert_includes js, "key_event.preventDefault()"
    refute_includes js, "Runtime.read(key_event"
  end

  def test_binding_and_action_dom_behavior_is_compiled_from_framework_ruby
    compiler = Swill::Ruby2JS::Compiler.new
    Swill::Ruby2JS::FRAMEWORK_SOURCES.each do |path|
      compiler.add(File.read(path), file: path)
    end

    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
# The connection readers are modules of functions, so they compile to a
# mixin factory carrying its own statics rather than to a class.
assert_includes js, "Swill__Connections__Bindings.establish = Swill__Connections__Bindings_Functions.establish;"
assert_includes js, "Swill__Connections__Actions.establish = Swill__Connections__Actions_Functions.establish;"
    assert_includes js, "class Swill__Controller__List extends Swill__Controller", "a class nested under a class compiles"
    assert_match(/Swill__Connections__Bindings\.establishIn\(\s*element,\s*item\s*\)/, js)
    assert_match(/Swill__Connections__Actions\.establishIn\(\s*element,\s*this\s*\)/, js)
    # Establishing a binding and reporting an edit are both compiled from the
    # framework's Ruby: the first lives in Binding, the second in the destination
    # that knows what an edit means for its kind of element.
    assert_includes js, "Runtime.observePath(object, key_path, push)"
    assert_includes js, "Runtime.isTruthy(value)"
    assert_includes js, "receiver.addEventListener(name, handler)"
    assert_includes js, "receiver.removeEventListener(name, handler)"

    assert_includes js, "controller.performAction(action_name, element, event)"
    assert_includes js, "Swill__Connections__Bindings.establish(controller)"
    assert_includes js, "Swill__Connections__Actions.establish(controller)"
    assert_match(/document\.addEventListener\(\s*"DOMContentLoaded"/, js)
    assert_includes js, "if (!event.persisted) return application.terminate()"
    modules = compiler.modules(name: "fixture", runtime: "../rb/runtime/runtime.mjs", publish: "Swill", launch: "Swill::Launcher")
    entry = modules.fetch("fixture.mjs")
    assert_includes entry, "if (typeof document !== \"undefined\")"
    assert_includes entry, 'new (Runtime.resolve("Swill::Launcher"))().install(document)'
    assert_raises(Swill::Ruby2JS::CompileError) do
      compiler.modules(name: "fixture", runtime: "../rb/runtime/runtime.mjs", launch: "Swill::Launcher")
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
    js = compiler_with_test_object.add(SORBET_OPERATIONS).javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "Runtime.must(this.person).greeting()", "T.must strips nilability, so the call is direct"
    assert_includes js, 'Runtime.cast(value, "Person").name', "T.cast types the receiver as the class"
    assert_includes js, 'items = Runtime.cast(value, "T::Array[String]")'
    assert_includes js, 'Runtime.append(items, "x")', "a T.let local is typed from its declaration"
    assert_includes js, 'Runtime.send(value, "length")', "T.unsafe forgets the type; the send is dynamic"
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
    ruby, status = Open3.capture2e("ruby", "-rjson", "-r./spec/mri_host", "-e", <<~RUBY)
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "Runtime.warn(`oops ${x}`)"
    assert_includes js, 'Runtime.send(x, "dirty?")'
    assert_match(/x ===? null/, js)
    assert_includes js, 'Runtime.send(x, "empty?")'
    assert_includes js, 'Runtime.respondsTo(x, "draft")'
    assert_includes js, 'Runtime.send(x, "dup")'
    assert_includes js, "x instanceof Probe"
    assert_includes js, 'Runtime.invoke(x, "between?", 1, 2)'
    assert_includes js, 'Runtime.invoke(x, "index", 1)', "a Ruby core method JavaScript lacks keeps Ruby's meaning"
    assert_includes js, 'Runtime.send(x, "first")'
    assert_includes js, 'Runtime.send(x, "to_s")'
    assert_includes js, 'Runtime.invoke(x, "some_member")', "parentheses make a zero-argument send a call"
    assert_includes js, 'Runtime.send(x, "some_property")'
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
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
    js = surface.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "static of(element) {"
    assert_includes js, "static findRoot(node) {"
    assert_includes js, "return Leaf.of(node);"
    error = assert_raises(Swill::Ruby2JS::CompileError) { javascript("def self.new; end") }
    assert_includes error.message, "unsupported method definition self.new"
    # A module is a namespace as well as a mixin. Its own functions are not
    # members of the layer it mixes in, so they compile onto the factory, which
    # is a function and so an object like any other.
    functions = compiler_with_test_object.add(<<~RUBY)
      module Helper
        extend T::Sig
        sig { params(value: String).returns(String) }
        def self.go(value)
          value
        end
      end
    RUBY
    js = functions.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "static go(value) {"
    assert_includes js, "Helper.go = Helper_Functions.go;"
    refute_includes js, "class Helper_Layer extends Superclass {\n    static go",
                    "a module function is not a member of what includes the module"
  end

  # A receiver whose class is known gets Ruby calls and property access from
  # the compiler's knowledge, not from parentheses; a DOM-typed receiver is
  # native, with the DOM table deciding listed members and the source's
  # parentheses deciding unlisted ones.
  # A bang becomes Bang, so save and save! are separate members. Ruby names
  # that still come out the same, such as save_bang and save!, cannot share a
  # class: within one it is plainly a collision, and across a class and its
  # ancestor it would silently replace the ancestor's member.
  def test_ruby_names_sharing_a_javascript_name_are_refused
    js = javascript("def save; true; end\ndef save!; end")
    assert_includes js, "save() {"
    assert_includes js, "saveBang() {"

    error = assert_raises(Swill::Ruby2JS::CompileError) do
      javascript("def save_bang; end\ndef save!; end")
    end
    assert_includes error.message, "Example#save_bang and Example#save! are both saveBang in JavaScript"

    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add(<<~RUBY).javascript(runtime: "../rb/runtime/runtime.mjs")
        class Record < TestObject
          def save!; end
        end
        class Post < Record
          def save_bang; end
        end
      RUBY
    end
    assert_includes error.message, "Post#save_bang and Record#save! are both saveBang in JavaScript"

    js = compiler_with_test_object.add(<<~RUBY).javascript(runtime: "../rb/runtime/runtime.mjs")
      class Record < TestObject
        def save!; end
      end
      class Post < Record
        def save!; end
        def save; true; end
      end
    RUBY
    assert_includes js, "class Post extends Record", "an override of the same Ruby name is not a collision"
  end

  # A browser member the DOM table does not list still compiles: called when
  # the source says so, and resolved when it runs when the source does not.
  def test_unlisted_dom_members_are_called_or_resolved_when_they_run
    js = compiler_with_test_object.add(<<~RUBY).javascript(runtime: "../rb/runtime/runtime.mjs")
      class Popover < TestObject
        extend T::Sig
        sig { params(element: Element).void }
        def show(element)
          element.showPopover
          element.showPopover()
          element.togglePopover(true)
        end
      end
    RUBY
    assert_includes js, 'Runtime.send(element, "showPopover");'
    assert_includes js, "element.showPopover();"
    assert_includes js, "element.togglePopover(true);"
  end

  def test_typed_receivers_resolve_from_knowledge_and_dom_receivers_from_the_table
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add(<<~RUBY)
      module Swill
        class Object
          def property_will_access(name); end
          def coerce_property_value(name, value, previous); value; end
          def property_will_change(name, previous, value); end
        end
      end
      class Widget < Swill::Object
        extend T::Sig
        property :count, type: Integer, default: 0
        sig { returns(Integer) }
        def tally; count; end
        sig { params(element: Element).returns(T.nilable(Widget)) }
        def self.of(element); element.__widget__; end
      end
      class Holder < Swill::Object
        extend T::Sig
        sig { params(element: Element).void }
        def initialize(element)
          super()
          @widget = Widget.new
          @element = element
        end
        property :tally, type: Integer do
          @widget.tally
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "other.count = other.tally();", "a typed parameter: property write and a call without parentheses"
    assert_includes js, "this._widget.count = this._widget.tally() + found.tally();", "an ivar assigned one class, and a local typed by a static method's signature"
    assert_includes js, "this._element.tally();", "a DOM-typed ivar is native"
    assert_includes js, "found.count,", "a declared property reads"
    assert_includes js, "      node.parentElement,\n      node.tally(),\n      Runtime.send(node, \"tally\"),\n",
                    "a listed DOM member reads; an unlisted one is called with parentheses, and otherwise the element says which it is"
    assert_includes js, 'return Runtime.send(element, "__widget__");', "an unlisted expando is resolved the same way"
    assert_includes js, "other.nextWidget()", "a member the class does not declare falls back to an explicit call"
    # A computed block is converted on its own, so its instance variables are
    # typed from the class it belongs to, not from the source handed over.
    assert_includes js, "computeTally() {\n            return this._widget.tally();", "an ivar is typed inside a computed block too"
  end

  # async and await are reserved forms: async def marks a method
  # asynchronous, await yields inside it, and both compile to JavaScript's
  # keywords. await elsewhere is rejected.
  def test_async_methods_and_await_compile_to_javascript_keywords
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Loader < TestObject
        extend T::Sig
        property :total, type: Integer, default: 0

        sig { params(value: Integer).returns(T.untyped) }
        def later(value)
          Promise.resolve(value)
        end

        sig { void }
        async def load
          first = await later(2)
          second = await later(3)
          self.total = first + second
        end

        sig { params(values: T::Array[Integer]).returns(T.untyped) }
        async def self.sum(values)
          results = await Promise.all(values.map { |value| Promise.resolve(value) })
          results.sum
        end
      end
    RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "async load() {"
    assert_includes js, "let first = await this.later(2);"
    assert_includes js, "static async sum(values) {"
    assert_includes js, "let results = await Promise.all("
    assert_equal [5, 6], execute(js + <<~JS)
      const loader = new (Runtime.resolve("Loader"))();
      loader.load().then(() => Runtime.resolve("Loader").sum([1, 2, 3])).then(sum => console.log(JSON.stringify([loader.total, sum])));
    JS
    error = assert_raises(Swill::Ruby2JS::CompileError) { javascript("def go; await later; end") }
    assert_includes error.message, "await outside an async method"
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      javascript("async def go; [1].each { |x| await x }; end")
    end
    assert_includes error.message, "await outside an async method"
    ruby, status = Open3.capture2e("ruby", "-rjson", "-r./spec/mri_host", "-e", <<~RUBY)
      class TestObject < Swill::Object; end
      class Loader < TestObject
        async def load; self.total = (await 2) + (await 3); end
        property :total, type: Integer, default: 0
      end
      loader = Loader.new
      loader.load
      puts JSON.generate(loader.total)
    RUBY
    assert status.success?, ruby
    assert_equal 5, JSON.parse(ruby), "on MRI async is a plain method and await yields its argument"
  end

  # A class body sets what an included ClassMethods declares as a
  # class_setting, and declares has_many/has_one relationships; both are
  # metadata the runtime installs, never evaluated Ruby.
  def test_class_bodies_configure_settings_and_declare_relationships
    # A relationship is ordinary Ruby: two properties, a registry entry, and
    # two forwarded methods. A plugin's macro is written exactly this way.
    feature = <<~RUBY
      module Feature
        def self.included(base); base.extend(ClassMethods); end
        module ClassMethods
          extend Swill::Declarations
          inheritable_registry :model_relationships
          class_setting :endpoint
          class_setting :codec

          macro def has_many(name, type:, key: name, url: nil)
            relate(name, type, key, url, "many")
          end

          macro def has_one(name, type:, key: name, url: nil)
            relate(name, type, key, url, "one")
          end

          macro def relate(name, type, key, url, kind)
            target = Swill::Runtime.class_name(type, self)
            many = kind == "many"
            value_type = many ? "T::Array[\#{target}]" : "T.nilable(\#{target})"
            property name, type: value_type, default: (many ? [] : nil), will_access: true
            property :"\#{name}_loading", type: T::Boolean, default: false
            model_relationships[name.to_s] = {"name" => name.to_s, "key" => key.to_s,
                                              "kind" => kind, "type" => target, "url" => url}
            forward :"load_\#{name}", to: :load_relationship, with: [name.to_s],
                    returns: value_type, async: true
            forward :"reload_\#{name}", to: :reload_relationship, with: [name.to_s],
                    returns: value_type, async: true
          end
        end
      end
    RUBY
    compiler = compiler_with_test_object.add(feature + <<~RUBY)
      class Codec < TestObject; end
      class Chapter < TestObject
        include Feature
        endpoint "/api/chapters"
        has_one :book, type: "Book", key: "book"
      end
      class Book < TestObject
        include Feature
        endpoint "/api/books"
        codec Codec
        has_many :chapters, type: Chapter, url: "/api/books/:id/chapters"
      end
    RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, 'settings: [{ name: "endpoint", js: "endpoint", value: "/api/books" }, { name: "codec", js: "codec", value: Codec }]'
    assert_includes js, 'modelRelationships: { "chapters": { "name": "chapters", "key": "chapters", "kind": "many", "type": "Chapter", "url": "/api/books/:id/chapters" } }'
    assert_includes js, 'modelRelationships: { "book": { "name": "book", "key": "book", "kind": "one", "type": "Book", "url": null } }'
    # The macro declares callable members, not just properties.
    assert_includes js, "async loadChapters() {\n    return await this.loadRelationship(\"chapters\");"
    rbi = compiler.rbi
    assert_includes rbi, "sig { returns(T::Array[Chapter]) }\n  def chapters; end"
    assert_includes rbi, "sig { returns(T.nilable(Book)) }\n  def book; end"
    assert_includes rbi, "def chapters_loading; end"
    assert_includes rbi, "sig { returns(T::Array[Chapter]) }\n  def load_chapters; end"
    assert_equal ["/api/books", "Codec", ["chapters"], "many", "Chapter", [], false, "/api/chapters", "Book"], execute(js + <<~JS)
      const book = new Book();
      const chapters = Book.modelRelationships();
      console.log(JSON.stringify([Book.endpoint(), Book.codec().name, Object.keys(chapters),
        chapters.chapters.kind, chapters.chapters.type,
        book.chapters, book.chaptersLoading, Chapter.endpoint(), Runtime.classWithSetting("endpoint", "/api/books").name]));
    JS
    # A macro's rejections are the ones its own definition makes, and the
    # compiler's are the ones only the graph can make.
    [
      ["endpoint compute_url", "undefined local variable or method 'compute_url'"],
      ["endpoint", "endpoint takes one value"],
      ["has_many :chapters", "missing keyword: :type"],
      ["has_many :chapters, type: \"chapter\"", "unknown constant chapter"],
      ["has_one :cover, type: Book, extra: 1", "unknown keyword: :extra"],
      ["has_one :cover, type: Missing", "uninitialized constant"]
    ].each do |declaration, message|
      error = assert_raises(Swill::Ruby2JS::CompileError, declaration) do
        compiler_with_test_object.add("#{feature}class Book < TestObject\ninclude Feature\n#{declaration}\nend")
          .javascript(runtime: "../rb/runtime/runtime.mjs")
      end
      assert_includes error.message, message
    end
    error = assert_raises(Swill::Ruby2JS::CompileError) { javascript('endpoint "/api/x"') }
    assert_includes error.message, 'unsupported class body: endpoint "/api/x"', "a setting nothing declares is not a macro"
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add("module M\nhas_many :x, type: TestObject\nend").javascript(runtime: "../rb/runtime/runtime.mjs")
    end
    assert_includes error.message, "unsupported class body: has_many :x, type: TestObject",
      "a module declares nothing a class does"
  end

  def test_registries_install_exact_snapshots_and_plain_class_keys_are_data
    compiler = compiler_with_test_object.add(<<~'RUBY')
      module RegistryFeature
        def self.included(base); base.extend(ClassMethods); end
        module ClassMethods
          extend Swill::Declarations
          inheritable_registry :items, :array
          inheritable_registry :metadata
          macro def configure(items_value, metadata_value)
            items.replace(items_value)
            metadata.clear
            metadata.merge!(metadata_value)
          end
        end
      end
      class RegistryParent < TestObject
        include RegistryFeature
        configure ["a", "b", "b"], {
          "parent_only" => true,
          "plain" => {"class" => "label"},
          "target" => TestObject
        }
      end
      class RegistryChild < RegistryParent
        configure ["b", "a", "b"], {
          "plain" => {"class" => "child label"},
          "target" => TestObject
        }
      end
    RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, '"plain": { "class": "child label" }'
    assert_equal [
      ["a", "b", "b"], ["b", "a", "b"],
      {"class" => "label"}, {"class" => "child label"},
      true, false
    ], execute(js + <<~JS)
      const parent = Runtime.resolve("RegistryParent");
      const child = Runtime.resolve("RegistryChild");
      console.log(JSON.stringify([
        parent.items(), child.items(), parent.metadata().plain, child.metadata().plain,
        child.metadata().target === Runtime.resolve("TestObject"),
        Object.hasOwn(child.metadata(), "parent_only")
      ]));
    JS
  end

  # A class object is a typed receiver: self.class, x.class, a T.class_of
  # parameter, and self in a class method all reach the class's static
  # methods and configuration. An awaited async member yields its declared
  # type, a bare browser function is JavaScript's, and a rescued error is
  # an Error.
  def test_class_objects_awaits_and_browser_globals_are_typed
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Record < TestObject
        extend T::Sig
        property :name, type: String, default: ""
        sig { params(value: String).returns(T.attached_class) }
        def self.named(value)
          record = new
          record.name = value
          record
        end
        sig { returns(T.attached_class) }
        async def self.later
          await Promise.resolve(named("later"))
        end
        sig { params(klass: T.class_of(Record)).returns(String) }
        def sibling_name(klass)
          klass.named("sibling").name
        end
        sig { returns(String) }
        async def own_name
          fresh = await self.class.later
          fresh.name.upcase
        end
        sig { params(url: String).returns(T::Boolean) }
        async def probe(url)
          response = await fetch(url, {"method" => "HEAD"})
          response.ok
        end
        sig { params(other: Record).returns(String) }
        def describe(other)
          JSON.generate(other.class.named("x").name)
        end
        sig { returns(String) }
        def guarded
          begin
            raise "boom"
          rescue => failure
            failure.message
          end
        end
      end
    RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, 'return klass.named("sibling").name;', "a T.class_of receiver calls the static method; the result reads its property"
    assert_includes js, "let fresh = await this.constructor.later();"
    assert_includes js, "return Runtime.upcase(fresh.name);", "an awaited async method yields its declared type"
    assert_includes js, "let response = await fetch(url, {"
    assert_includes js, "return response.ok;", "a bare fetch yields a Response"
    assert_includes js, 'JSON.stringify(other.constructor.named("x").name)'
    assert_includes js, "return failure.message;"
    stub = "globalThis.fetch = async (url, init) => ({ok: init.method === \"HEAD\"});\n"
    assert_equal ["LATER", true, "sibling", "\"x\"", "boom"], execute(stub + js + <<~JS)
      const record = new Record();
      Promise.all([record.ownName(), record.probe("/x")]).then(([own, ok]) =>
        console.log(JSON.stringify([own, ok, record.siblingName(Record), record.describe(record), record.guarded()])));
    JS
    rbi = Swill::Ruby2JS::DOM.rbi
    assert_includes rbi, "module Kernel"
    assert_includes rbi, "sig { params(url: String, init: T.untyped).returns(Response) }\n  def fetch(url, init = nil); end", "the RBI names the awaited value"
  end

  # A block of several statements yields its last expression, a hash
  # included, whatever the method it is passed to.
  def test_multi_statement_blocks_yield_their_last_expression
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Grouper < TestObject
        extend T::Sig
        sig { params(items: T::Array[Integer]).returns(T::Array[T.untyped]) }
        def pairs(items)
          items.map do |item|
            doubled = item * 2
            {"item" => item, "doubled" => doubled}
          end
        end
        sig { params(items: T::Array[Integer]).returns(T::Array[Integer]) }
        def descending(items)
          items.sort do |left, right|
            difference = right - left
            difference
          end
        end
        sig { params(items: T::Array[Integer]).returns(T::Array[Integer]) }
        def big(items)
          items.select do |item|
            limit = 2
            item > limit
          end
        end
      end
    RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "return { item, doubled };"
    assert_equal [[{"item" => 1, "doubled" => 2}], [3, 2, 1], [3]], execute(js + <<~JS)
      const grouper = new (Runtime.resolve("Grouper"))();
      console.log(JSON.stringify([grouper.pairs([1]), grouper.descending([1, 3, 2]), grouper.big([1, 2, 3])]));
    JS
  end

  def test_sorbet_runtime_operations_type_their_results
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add("class Leaf\nextend T::Sig\nsig { returns(Integer) }\ndef size; 1; end\nend\nclass Holder\ndef pick(value, node); T.cast(value, Leaf).size; T.must(node).size; end\nend")
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, 'Runtime.cast(value, "Leaf").size()', "a cast receiver calls its collected method"
    assert_includes js, 'Runtime.send(Runtime.must(node), "size")', "an untyped receiver stays dynamic after T.must"
  end

  # Safe navigation is JavaScript's own ?. wherever the compiler resolves the
  # member statically: a declared property, a collected method, a DOM member.
  # A property reads and a method is called, as they are without the guard.
  def test_safe_navigation_guards_statically_resolved_members
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Leaf < TestObject
        extend T::Sig
        property :tag, type: String, default: "leaf"
        property :other, type: T.nilable(Leaf), default: nil
        sig { returns(String) }
        def label; tag.upcase; end
      end
      class Holder < TestObject
        extend T::Sig
        property :leaf, type: T.nilable(Leaf), default: nil
        sig { void }
        def initialize
          super()
          @held = T.let(nil, T.nilable(Leaf))
        end
        sig { params(leaf: T.nilable(Leaf)).void }
        def hold(leaf); @held = leaf; end
        sig { returns(T.nilable(String)) }
        def property_of_property; leaf&.tag; end
        sig { returns(T.nilable(String)) }
        def method_of_property; leaf&.label; end
        sig { returns(T.nilable(String)) }
        def property_of_ivar; @held&.tag; end
        sig { returns(T.nilable(String)) }
        def method_of_ivar; @held&.label; end
        sig { returns(T.nilable(String)) }
        def chained; @held&.other&.tag; end
        sig { returns(String) }
        def title; @held&.label || "none"; end
        sig { params(element: T.nilable(Element)).void }
        def detach(element); element&.remove(); end
      end
    RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "return Runtime.nilable(this.leaf?.tag);", "a property of a property"
    assert_includes js, "return Runtime.nilable(this.leaf?.label());", "a method of a property"
    assert_includes js, "return Runtime.nilable(this._held?.tag);", "a property of an instance variable"
    assert_includes js, "return Runtime.nilable(this._held?.label());", "a method of an instance variable"
    assert_includes js, "return Runtime.nilable(this._held?.other?.tag);", "each hop guards the next, normalized once"
    assert_includes js, "element?.remove()", "a DOM member"
    assert_equal [[nil, nil, nil, nil, nil, "none"], ["leaf", "LEAF", "leaf", "LEAF", nil, "LEAF"],
                  ["leaf", "LEAF", "leaf", "LEAF", "deep", "LEAF"]], execute(js + <<~JS)
      const read = holder => [holder.propertyOfProperty(), holder.methodOfProperty(),
        holder.propertyOfIvar(), holder.methodOfIvar(), holder.chained(), holder.title()];
      const holder = new Holder();
      const empty = read(holder);
      const leaf = new Leaf();
      holder.leaf = leaf;
      holder.hold(leaf);
      const held = read(holder);
      const deep = new Leaf();
      deep.tag = "deep";
      leaf.other = deep;
      console.log(JSON.stringify([empty, held, read(holder)]));
    JS
    # nil answers nil to everything that asks, whatever JavaScript calls it.
    assert_equal [true, true, false, true], execute(js + <<~JS)
      const value = new Holder().methodOfIvar();
      console.log(JSON.stringify([value == null, Runtime.isEqual(value, null),
        Runtime.isTruthy(value), Runtime.read(value, "nil?")]));
    JS
    [
      ["sig { params(other: T.untyped).returns(T.untyped) }\ndef go(other); other&.go; end",
       "not lowered on an untyped receiver"],
      ["sig { params(text: T.nilable(String)).returns(T.untyped) }\ndef go(text); text&.upcase; end",
       "not lowered on a T.nilable(String) receiver"]
    ].each do |body, message|
      error = assert_raises(Swill::Ruby2JS::CompileError, body) { javascript("extend T::Sig\n#{body}") }
      assert_includes error.message, message
    end
  end

  # T.bind tells Sorbet what self is inside a mixin, where self.class cannot
  # reach the including class's class methods. In JavaScript self already is
  # the instance, so it compiles to nothing. A cast to a generic class checks
  # the class, as sorbet-runtime does; the type arguments are Sorbet's.
  def test_bind_is_erased_and_generic_casts_check_their_class
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Box < TestObject
        extend T::Sig
        extend T::Generic
        Item = type_member
        sig { returns(Integer) }
        def size; 3; end
      end
      module Sizing
        extend T::Sig
        sig { params(value: T.untyped).returns(Integer) }
        def measured(value)
          T.bind(self, Holder)
          T.cast(value, Box[T.untyped]).size + limit
        end
      end
      class Holder < TestObject
        extend T::Sig
        include Sizing
        sig { returns(Integer) }
        def limit; 1; end
      end
    RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    refute_match(/T\.bind|Runtime\.bind/, js, "T.bind leaves nothing behind")
    assert_includes js, 'Runtime.cast(value, "Box").size()', "the class is checked and its member typed"
    assert_equal [4], execute(js + <<~JS)
      console.log(JSON.stringify([new Holder().measured(new Box())]));
    JS
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      javascript("def go(other); T.bind(other, Example); end")
    end
    assert_includes error.message, "T.bind binds self"
  end

  def test_attribute_accessors_compile_to_native_accessors
    compiler = compiler_with_test_object.add(<<~RUBY)
      class Tally < TestObject
        extend T::Sig
        def initialize
          super
          @count = 2
          @selected_label = "a"
        end
        sig { returns(Integer) }
        attr_reader :count
        sig { returns(String) }
        attr_accessor :selected_label
        sig { params(total: Integer).returns(Integer) }
        attr_writer :total
        sig { returns(Integer) }
        def doubled; count * 2; end
        sig { params(other: Tally).returns(String) }
        def relabel(other)
          other.selected_label = "b"
          other.selected_label + selected_label
        end
        sig { params(other: T.untyped).returns(T.untyped) }
        def untyped_count(other); other.count; end
      end
    RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "get count() {\n    return this._count;"
    assert_includes js, "get selectedLabel() {"
    assert_includes js, "set selectedLabel(selected_label) {"
    assert_includes js, "set total(total) {"
    assert_includes js, "return this.count * 2", "a reader on self is read, not called"
    assert_includes js, "other.selectedLabel + this.selectedLabel"
    assert_includes js, 'Runtime.send(other, "count")'
    assert_equal [4, "ba", 2, true, 2], execute(js + <<~JS)
      const tally = new Tally();
      console.log(JSON.stringify([tally.doubled(), tally.relabel(new Tally()), tally.untypedCount(tally),
        Runtime.respondsTo(tally, "total="), Runtime.invoke(tally, "count")]));
    JS

    error = assert_raises(Swill::Ruby2JS::CompileError) { javascript("attr_reader name") }
    assert_includes error.message, "attr_reader takes literal symbol names"
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      javascript("attr_reader :count\ndef go; count(1); end")
    end
    assert_includes error.message, "count is an attribute reader and takes no arguments"
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add(<<~RUBY).javascript(runtime: "./runtime.mjs")
        class Counter < TestObject
          attr_reader :count
        end
        class Recount < Counter
          def count; 3; end
        end
      RUBY
    end
    assert_includes error.message, "Recount#count must be declared as the member it overrides is"
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
        .javascript(runtime: "../rb/runtime/runtime.mjs")
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, 'Runtime.fetch(Runtime.must(this.seed), "name")', "the outlet reads as its declared type"
    assert_match(/"seed": \{\s*type: "T\.nilable\(T::Hash\[String, String\]\)"/, js)
    assert_match(/"owner": \{\s*type: "T\.nilable\(Demo::Person\)"/, js, "a class type is resolved to its installed name")
    assert_includes compiler.rbi, "sig { returns(T.nilable(T::Hash[String, String])) }"
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add("module Tracking; end\nclass Example < TestObject\noutlet :seed, type: Tracking\nend")
        .javascript(runtime: "../rb/runtime/runtime.mjs")
    end
    assert_includes error.message, "outlet seed: Tracking is not a class"
  end

  def test_dynamic_declarations_and_mutable_defaults_are_rejected
    ['property field, type: String', 'property :names, type: T::Array[String], default: [1]',
     'property :name, type: String, nonsense: true', 'prepend Other'].each do |body|
      assert_raises(Swill::Ruby2JS::CompileError) { javascript(body) }
    end
  end

  # A macro's keywords are Ruby's own: whatever its definition requires is
  # required, and the rejection is the one Ruby gives, with the file and line
  # the declaration is written on.
  # JavaScript has no leading optional parameter, so a Ruby method with
  # optional arguments compiles the way Cocoa spells an overload: one method
  # per arity, named for the optionals it takes.
  def test_optional_arguments_compile_to_one_method_per_arity
    compiler = compiler_with_test_object.add(<<~'RUBY')
      class Greeter < TestObject
        extend T::Sig
        sig { params(greeting: String, name: String).returns(String) }
        def greet(greeting = "Hello", name)
          "#{greeting}, #{name}"
        end
        sig { params(a: Integer, b: Integer, c: Integer).returns(Integer) }
        def span(a, b = 2, c = 3)
          a + b + c
        end
        sig { returns(T::Array[T.untyped]) }
        def calls
          [greet("Ada"), greet("Hi", "Grace"), span(1), span(1, 9), span(1, 9, 9)]
        end
      end
    RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    # The widest variant carries the body; the shorter ones hand it the defaults.
    assert_includes js, "greetWithGreeting(greeting, name) {"
    assert_includes js, "greet(name) {\n    return Greeter.prototype.greetWithGreeting.call(this, \"Hello\", name);"
    assert_includes js, "spanWithBAndC(a, b, c) {"
    assert_includes js, "span(a) {\n    return Greeter.prototype.spanWithBAndC.call(this, a, 2, 3);"
    assert_includes js, "spanWithB(a, b) {\n    return Greeter.prototype.spanWithBAndC.call(this, a, b, 3);"
    # The argument count says which member of the family a send means.
    assert_includes js, 'this.greet("Ada")'
    assert_includes js, 'this.greetWithGreeting("Hi", "Grace")'
    assert_includes js, 'this.spanWithB(1, 9)'
    assert_includes js, '"family": "greet"'
    assert_equal ["Hello, Ada", "Hi, Grace", 6, 13, 19], execute(js + <<~JS)
      console.log(JSON.stringify(new (Runtime.resolve("Greeter"))().calls()));
    JS
    # And through metadata, where the count resolves the family.
    assert_equal ["Hello, Ada", "Hi, Grace"], execute(js + <<~JS)
      const greeter = new (Runtime.resolve("Greeter"))();
      console.log(JSON.stringify([Runtime.invoke(greeter, "greet", "Ada"),
        Runtime.invoke(greeter, "greet", "Hi", "Grace")]));
    JS
  end

  # An override is the same family, so super reaches the parent's variant of
  # the same width and the subclass keeps its own default.
  def test_super_from_a_variant_reaches_the_same_variant
    js = compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
      class Greeter < TestObject
        extend T::Sig
        sig { params(greeting: String, name: String).returns(String) }
        def greet(greeting = "Hello", name)
          "#{greeting}, #{name}"
        end
      end
      class Loud < Greeter
        extend T::Sig
        sig { params(greeting: String, name: String).returns(String) }
        def greet(greeting = "Hey", name)
          super.upcase
        end
      end
    RUBY
    assert_includes js, "return Runtime.upcase(super.greetWithGreeting(greeting, name));"
    assert_includes js, "greet(name) {\n    return Loud.prototype.greetWithGreeting.call(this, \"Hey\", name);"
    assert_equal ["Hello, Ada", "HEY, ADA", "HI, ADA"], execute(js + <<~JS)
      const loud = new (Runtime.resolve("Loud"))();
      const plain = new (Runtime.resolve("Greeter"))();
      console.log(JSON.stringify([plain.greet("Ada"), loud.greet("Ada"), loud.greetWithGreeting("Hi", "Ada")]));
    JS
  end

  def test_optional_class_methods_use_the_same_arity_variants
    js = compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
      class Labels < TestObject
        def self.make(prefix = "Hello", name)
          "#{prefix}, #{name}"
        end
        def self.calls
          [make("Ada"), make("Hi", "Grace")]
        end
      end
    RUBY
    assert_includes js, "static makeWithPrefix(prefix, name)"
    assert_equal ["Hello, Ada", "Hi, Grace"], execute(js + <<~JS)
      console.log(JSON.stringify(Runtime.resolve("Labels").calls()));
    JS
  end

  # The types a signature declares follow the parameters, not the argument
  # positions, so a lambda passed to a shorter variant is still typed.
  def test_a_lambda_passed_to_a_shorter_variant_keeps_its_declared_types
    js = compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
      class Runner < TestObject
        extend T::Sig
        sig { params(label: String, block: T.proc.params(text: String).returns(String)).returns(String) }
        def run(label = "job", block)
          block.call(label)
        end
        sig { returns(String) }
        def go
          run(->(text) { text.strip })
        end
      end
    RUBY
    assert_includes js, "Runtime.strip(text)", "the lambda's parameter is typed from the parameter it lands on"
  end

  def test_optional_arguments_are_rejected_where_they_cannot_be_ported
    [
      ["class Example < TestObject\ndef go(*); nil; end\nend", "anonymous method parameters"],
      ["class Example < TestObject\ndef go(**nil); nil; end\nend", "unsupported method parameter form"],
      ["class Example < TestObject\nextend T::Sig\nsig { params(b: Integer, a: Integer).returns(Integer) }\ndef go(a, b); a; end\nend",
       "signature parameters must match go's parameters in order"],
      ["class Example < TestObject\ndef go(items); items.each { |a, b = 1| a }; end\nend", "a block takes required arguments only"]
    ].each do |body, message|
      error = assert_raises(Swill::Ruby2JS::CompileError, body) do
        compiler_with_test_object.add(body).javascript(runtime: "../rb/runtime/runtime.mjs")
      end
      assert_includes error.message, message
    end
    # An override that drops the optional would shadow only the shorter arity.
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
        class Greeter < TestObject
          def greet(greeting = "Hello", name); name; end
        end
        class Loud < Greeter
          def greet(name); name; end
        end
      RUBY
    end
    assert_includes error.message, "Loud#greet must accept the same arities"

    # Accepted arities, rather than only optional names, define a family.
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
        class Greeter < TestObject
          def greet(greeting = "Hello", name); name; end
        end
        class Loud < Greeter
          def greet(prefix, greeting = "Hey", name); name; end
        end
      RUBY
    end
    assert_includes error.message, "Loud#greet must accept the same arities"

    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
        module Greeting
          def greet(greeting = "Hello", name); name; end
        end
        class Loud < TestObject
          include Greeting
          def greet(name); name; end
        end
      RUBY
    end
    assert_includes error.message, "Loud#greet must accept the same arities"

    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
        class Greeter < TestObject
          def greet(greeting = "Hello", name); name; end
          def broken; greet("one", "two", "three"); end
        end
      RUBY
    end
    assert_includes error.message, "wrong number of arguments for greet: 3"
  end

  def test_rest_keywords_and_blocks_preserve_ruby_call_semantics
    source = <<~'RUBY'
      class Flexible < TestObject
        def arrange(prefix = "P", *middle, tail, flag:, mark: "!", **extra, &block)
          [prefix, middle, tail, flag, mark, extra, block_given?, block.call(prefix)]
        end

        def calls
          first = arrange("A", "B", "C", flag: 4, note: 5) { |value| value }
          callback = ->(value) { value }
          second = arrange("Z", flag: 6, mark: nil, &callback)
          values = ["D", "E", "F"]
          options = {flag: 7, note: 8}
          third = arrange(*values, **options, &callback)
          [first, second, third, separate({flag: 9}),
           around("Y") { |value| value }, around("N")]
        end

        def separate(value, **options)
          [value, options]
        end

        def around(value)
          return "none" unless block_given?
          yield value
        end
      end
    RUBY
    ruby = [["A", ["B"], "C", 4, "!", {"note" => 5}, true, "A"],
            ["P", [], "Z", 6, nil, {}, true, "P"],
            ["D", ["E"], "F", 7, "!", {"note" => 8}, true, "D"],
            [{"flag" => 9}, {}], "Y", "none"]
    js = compiler_with_test_object.add(source).javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "...__swill_arguments"
    assert_includes js, "Runtime.keywordArguments"
    assert_includes js, "Runtime.blockArgument"
    assert_equal ruby, execute(js + <<~JS)
      console.log(JSON.stringify(new (Runtime.resolve("Flexible"))().calls()));
    JS
  end

  def test_complex_methods_keep_implicit_returns_and_typed_block_parameters
    js = compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
      class Walker < TestObject
        extend T::Sig

        sig { params(element: Element, block: T.proc.params(child: Element).void).returns(String) }
        def walk(element, &block)
          yield element
          result = element.tagName
          result
        end

        sig { params(element: Element).returns(String) }
        def label(element)
          found = ""
          walk(element) { |child| found = child.tagName }
          found
        end
      end
    RUBY
    assert_includes js, "return result;"
    assert_includes js, "child.tagName", "the carried block is not reprocessed without its parameter type"
    refute_includes js, "child.tagName()"
    assert_equal ["SECTION", "SECTION"], execute(js + <<~JS)
      const element = {tagName: "SECTION"};
      const walker = new (Runtime.resolve("Walker"))();
      console.log(JSON.stringify([walker.walk(element, Runtime.blockArgument(() => {})), walker.label(element)]));
    JS
  end

  def test_mixin_class_methods_bind_optional_and_keyword_arguments
    js = compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
      module Naming
        def self.included(base)
          base.extend(ClassMethods)
        end
        module ClassMethods
          def label(prefix = "x", suffix:)
            [prefix, suffix]
          end
        end
      end
      class Named < TestObject
        include Naming
        def self.calls
          [label(suffix: "y"), label("a", suffix: "b")]
        end
      end
    RUBY
    assert_equal [["x", "y"], ["a", "b"]], execute(js + <<~JS)
      console.log(JSON.stringify(Runtime.resolve("Named").calls()));
    JS
  end

  def test_a_forward_passes_declared_parameters_and_generates_the_same_rbi
    compiler = compiler_with_test_object.add(<<~'RUBY')
      module Delegating
        def self.included(base); base.extend(ClassMethods); end
        module ClassMethods
          extend Swill::Declarations
          inheritable_registry :delegations
          macro def prefixer
            forward :prefixed, to: :join, with: ["fixed"],
                    parameters: {suffix: String}, returns: String
          end
        end
      end
      class Example < TestObject
        include Delegating
        prefixer
        def join(prefix, suffix); "#{prefix}:#{suffix}"; end
      end
    RUBY

    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "prefixed(suffix) {"
    assert_includes js, 'return this.join("fixed", suffix);'
    assert_includes compiler.rbi, "sig { params(suffix: String).returns(String) }\n  def prefixed(suffix); end"
    assert_equal "fixed:value", execute(js + <<~JS)
      console.log(JSON.stringify(new (Runtime.resolve("Example"))().prefixed("value")));
    JS
  end

  def test_a_macros_required_keyword_is_required
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add(<<~RUBY)
        module Recorded
          def self.included(base); base.extend(ClassMethods); end
          module ClassMethods
            extend Swill::Declarations
            inheritable_registry :model_attributes
            macro def attribute(name, type:, default:, key: name)
              model_attributes[name.to_s] = {"name" => name.to_s, "key" => key.to_s}
              property name, type: type, default: default, attribute: true, key: key
            end
          end
        end
        class Example < TestObject
          include Recorded
          attribute :name, type: String
        end
      RUBY
    end
    assert_includes error.message, "missing keyword: :default"
  end

  def test_missing_include_is_rejected_and_local_classes_can_be_reopened
    assert_raises(Swill::Ruby2JS::CompileError) { javascript("include Missing") }
    compiler = compiler_with_test_object
    compiler.add(<<~RUBY, file: "generated.rb")
      class Example < TestObject
        property :name, type: String, default: "Ada"
        def label; "generated"; end
      end
    RUBY
    compiler.add(<<~'RUBY', file: "client.rb")
      class Example
        property :title, type: String, default: "Engineer"
        def label; "handwritten"; end
        def description; "#{name}: #{title}"; end
      end
    RUBY

    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    combined = compiler_with_test_object.add(<<~'RUBY').javascript(runtime: "../rb/runtime/runtime.mjs")
      class Example < TestObject
        property :name, type: String, default: "Ada"
        property :title, type: String, default: "Engineer"
        def label; "handwritten"; end
        def description; "#{name}: #{title}"; end
      end
    RUBY
    assert_equal 1, compiler.knowledge.local.count { |entry| entry["name"] == "Example" }
    assert_equal 1, js.scan("class Example extends").length
    refute_includes js, 'return "generated"'
    assert_equal combined, js, "reopening adds no JavaScript indirection or duplicate methods"
    assert_equal ["handwritten", "Ada: Engineer"], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify([object.label(), object.description()]));
    JS
  end

  def test_failed_reopening_restores_the_last_accepted_class
    compiler = compiler_with_test_object
      .add("class Other < TestObject; end")
      .add("class Example < TestObject\ndef label; \"accepted\"; end\nend")

    assert_raises(Swill::Ruby2JS::CompileError) do
      compiler.add("class Example < Other\ndef label; \"rejected\"; end\nend")
    end
    compiler.add("class Example\ndef extra; \"ready\"; end\nend")
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_equal ["accepted", "ready"], execute(js + <<~JS)
      const object = new (Runtime.resolve("Example"))();
      console.log(JSON.stringify([object.label(), object.extra()]));
    JS
  end

  def test_application_classes_and_modules_expose_constants
    compiler = compiler_with_test_object
      .add(<<~RUBY)
        module Catalog
          LABELS = ["new", "old"]

          class Item < TestObject
            PRIORITIES = {"high" => 1, "low" => 2}

            def self.labels
              Catalog::LABELS
            end

            def priority
              PRIORITIES["high"]
            end
          end
        end
      RUBY
      .add(<<~RUBY)
        module Catalog
          class Item
            EXTRA = 3
          end
        end
      RUBY
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "Catalog__Item.PRIORITIES"
    assert_includes js, "Catalog.LABELS"
    assert_equal [["new", "old"], 1, 3], execute(js + <<~JS)
      const Item = Runtime.resolve("Catalog::Item");
      console.log(JSON.stringify([Item.labels(), new Item().priority(), Item.EXTRA]));
    JS
  end

  def test_source_is_preflighted_and_failed_evaluation_can_be_retried
    $swill_preflight_marker = false
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler_with_test_object.add(<<~'RUBY')
        class Unsupported < TestObject
          $swill_preflight_marker = true
        end
      RUBY
    end
    assert_includes error.message, "unsupported class body"
    assert_equal false, $swill_preflight_marker, "unsupported class-body code never runs"

    Dir.mktmpdir do |directory|
      file = File.join(directory, "retry.rb")
      File.write(file, "# compiler fixture\n")
      compiler = compiler_with_test_object
      assert_raises(Swill::Ruby2JS::CompileError) do
        compiler.add("class Retriable < TestObject\nproperty :name, type: String, default: \"\", nonsense: true\nend", file: file)
      end
      assert_nil compiler.loader.constant("Retriable"), "a failed evaluation removes partial constants"
      compiler.add("class Retriable < TestObject\nproperty :name, type: String, default: \"ready\"\nend", file: file)
      js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
      assert_equal "ready", execute(js + <<~JS)
        console.log(JSON.stringify(new (Runtime.resolve("Retriable"))().name));
      JS
    end
  ensure
    $swill_preflight_marker = nil
  end

  def test_an_application_cannot_declare_inside_an_imported_namespace
    imports = [{"name" => "Swill::Object"}]
    compiler = Swill::Ruby2JS::Compiler.new(imports: imports)
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler.add("module Swill\nclass Extension < Object; end\nend")
    end
    assert_includes error.message, "application cannot declare inside imported namespace Swill::Extension"
    assert_nil compiler.loader.constant("Swill::Extension")
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
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
          base.property :name, type: String, default: "Ada"
        end
        def label; name; end
      end
    RUBY
    application = Swill::Ruby2JS::Compiler.new(
      imports: framework.knowledge.interface,
      loader: framework.loader && Swill::Ruby2JS::Loader.new(parent: framework.loader)
    ).add(<<~RUBY)
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
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
      "Swill::Object" => "class",
      "TestObject" => "class",
      "Feature" => "mixin",
      "Feature::Helper" => "class",
      "Namespace::Record" => "class",
      "Example" => "class"
    }, entries)
    refute entries.key?("Namespace")

    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs") + <<~JS
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
    js = compiler_with_test_object.add(source).javascript(runtime: "../rb/runtime/runtime.mjs")
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

  def test_bare_super_forwards_bound_parameters_and_empty_super_uses_parent_defaults
    source = <<~'RUBY'
      class Parent < TestObject
        def initialize(value); super(); @value = value; end
        def value; @value; end
        def pair(left, right); [left, right]; end
        def optional(value = "parent"); value; end
        def empty(value = "parent"); value; end
        def self.option(value = "parent"); value; end
      end
      module ForwardPair
        def pair(left, right); super; end
      end
      class Child < Parent
        include ForwardPair
        def initialize(value); value = "constructor"; super; end
        def pair(left, right); left = "changed"; super; end
        def optional(value = "child"); super; end
        def empty(value = "child"); super(); end
        def self.option(value = "child"); super; end
      end
    RUBY
    js = compiler_with_test_object.add(source).javascript(runtime: "../rb/runtime/runtime.mjs")
    actual = execute(js + <<~JS)
      const child = new Child("original");
      console.log(JSON.stringify([child.value(), child.pair("left", "right"),
        Runtime.invoke(child, "optional"), Runtime.invoke(child, "empty"), Child.option()]));
    JS
    ruby, status = Open3.capture2e("ruby", "-rjson", "-e", <<~RUBY)
      class TestObject; end
      #{source}
      child = Child.new("original")
      puts JSON.generate([child.value, child.pair("left", "right"), child.optional, child.empty, Child.option])
    RUBY
    assert status.success?, ruby
    assert_equal JSON.parse(ruby), actual
  end

  def test_bare_super_forwards_rest_keywords_and_the_original_block
    source = <<~'RUBY'
      class Parent < TestObject
        def gather(value = "parent", *rest, label: "parent", **options, &block)
          [value, rest, label, options, block ? block.call(value) : nil]
        end
        def defaults(value = "parent", *rest, label: "parent")
          [value, rest, label]
        end
        def omit(value = "parent", &block)
          [value, block ? block.call(value) : nil]
        end
        def implicit(value = "parent")
          yield value
        end
        def self.keywords(required:, optional: "parent")
          [required, optional]
        end
      end
      class Child < Parent
        def gather(value = "child", *rest, label: "child", **options, &block)
          value = "changed"
          rest = ["replacement"]
          label = "new label"
          options = {extra: "new option"}
          block = nil
          super
        end
        def defaults(value = "child", *rest, label: "child")
          super
        end
        def omit(value = "child", &block)
          super()
        end
        def implicit(value = "child")
          super if block_given?
        end
        def self.keywords(required:, optional: "child")
          required = "changed"
          super
        end
      end
    RUBY
    js = compiler_with_test_object.add(source).javascript(runtime: "../rb/runtime/runtime.mjs")
    actual = execute(js + <<~JS)
      const child = new Child();
      console.log(JSON.stringify([child.gather(), child.gather("given", "tail",
        Runtime.keywordArguments({label: "given", extra: "given"}), Runtime.blockArgument(value => value)),
        child.defaults(), child.omit("given", Runtime.blockArgument(value => value)),
        child.implicit(Runtime.blockArgument(value => value)), Child.keywords(Runtime.keywordArguments({required: "given"}))]));
    JS
    ruby, status = Open3.capture2e("ruby", "-rjson", "-e", <<~RUBY)
      class TestObject; end
      #{source}
      child = Child.new
      puts JSON.generate([child.gather, child.gather("given", "tail", label: "given", extra: "given") { |value| value },
        child.defaults, child.omit("given") { |value| value }, child.implicit { |value| value }, Child.keywords(required: "given")])
    RUBY
    assert status.success?, ruby
    assert_equal JSON.parse(ruby), actual
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
      def nil_readers(value); [value.present?, value.nil?, value.to_s]; end
    RUBY
    assert_includes js, "Runtime.isTruthy("
    assert_includes js, "Runtime.logicalOr("
    assert_includes js, "Runtime.logicalAnd("
    assert_includes js, "Runtime.upcase(Runtime.strip(value))"
    assert_includes js, "Runtime.isBlank(value)"
    # Untyped receivers use the one dynamic reader instead of a name-based rewrite.
    assert_includes js, 'Runtime.send(Runtime.send(value, "strip"), "upcase")'
    assert_includes js, 'Runtime.send(value, "blank?")'
    assert_includes js, "Runtime.isPresent(text)"
    assert_includes js, "Runtime.isEmpty(text)"
    assert_includes js, "Runtime.isEmpty(items)"
    assert_includes js, "Runtime.isBlank(items)"
    assert_includes js, "thing == null"
    assert_includes js, "text == null"
    assert_includes js, 'Runtime.send(value, "present?")'
    assert_includes js, "value == null", "nil? never needs the runtime"
    refute_includes js, "let $T ="
    refute_includes js, "let $ror ="
    refute_includes js, "let $rand ="
    refute_includes js, "Runtime.valueRead("
    # nil answers the readers Ruby's nil has; any other send to it raises, as
    # in Ruby, rather than answering nil.
    assert_equal [[true, false, true, true, true, false], [false, true, false], [false, true, ""],
                  "Cannot call empty? on nil"], execute(js + <<~JS)
      const example = new (Runtime.resolve("Example"))();
      let raised;
      try { example.dynamicReaders(null); } catch (error) { raised = error.message; }
      console.log(JSON.stringify([example.readers("Ada", [], null), example.dynamicReaders(""),
        example.nilReaders(null), raised]));
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
    # A local first assigned in a branch is typed from it: reading it
    # unassigned would be a bug in Ruby too, and a String compares by identity.
    assert_includes js, "local === []"
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes js, "other.strip()"
    assert_includes js, "Runtime.strip(text)"
    assert_includes js, 'Runtime.send(value, "strip")'
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
    js = compiler_with_test_object.add(CORE_TYPES).javascript(runtime: "../rb/runtime/runtime.mjs")
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
    # The MRI host supplies blank? and present?, as the runtime does in JS.
    ruby, status = Open3.capture2e("ruby", "-rjson", "-r./spec/mri_host", "-e", <<~RUBY)
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
        def rename!; self.name = "Renamed"; end
      end
      class Caller < TestObject
        def read_name(thing); thing.name; end
        def called_name(thing); thing.name(); end
        def called_initials(thing); thing.initials(); end
        def renamed(thing); thing.rename!; thing.name; end
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
    # Nothing about an untyped receiver is decided by name: every send is
    # resolved through metadata at run time, as Ruby itself would resolve it.
    assert_includes js, 'Runtime.send(thing, "name")'
    assert_includes js, 'Runtime.write(thing, "name", "Grace")'
    assert_includes js, 'Runtime.invoke(thing, "greet", "Hello")'
    assert_includes js, 'Runtime.send(thing, "initials")'
    # Parentheses or a bang say the send is a call; no property can be one.
    assert_includes js, 'Runtime.invoke(thing, "initials")'
    assert_includes js, 'Runtime.invoke(thing, "name")'
    assert_includes js, 'Runtime.invoke(thing, "rename!")'
    assert_includes js, 'person.greet("Hi")', "constructing a collected class types the local"
    assert_includes js, 'value[0] + Runtime.send(value, "length")', "indexing and operators stay native; length is a value reader"
    assert_equal ["Ada", "Grace", "Hello Grace", "G", "Hi Ada", 3, "Unknown method or wrong arity: greet", "plain",
                  "Grace", "G", "Renamed", "Cannot call name on nil"], execute(js + <<~JS)
      const caller = new (Runtime.resolve("Caller"))();
      const person = new (Runtime.resolve("Person"))();
      const results = [caller.readName(person)];
      caller.writeName(person);
      results.push(person.name, caller.greet(person), caller.plainCall(person), caller.constructed(), caller.native([1, 2]));
      try { caller.greet({}); } catch (error) { results.push(error.message); }
      results.push(caller.readName({name: "plain"}), "a plain object is a Hash: reads are key-value coding");
      results.pop();
      // A reader called with parentheses is still the reader; a bang method
      // is called; nil is not a receiver.
      results.push(caller.calledName(person), caller.calledInitials(person), caller.renamed(person));
      try { caller.readName(null); } catch (error) { results.push(error.message); }
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
        class Controller < Responder
          macro def self.outlet(name, type:, optional: false, &computed)
            property name, type: Swill::Runtime.optional_type(type), default: nil,
                           outlet: true, optional: optional, &computed
          end
        end
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
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
        class Controller < Responder
          macro def self.outlet(name, type:, optional: false, &computed)
            property name, type: Swill::Runtime.optional_type(type), default: nil,
                           outlet: true, optional: optional, &computed
          end
        end
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
        class Controller < Responder
          macro def self.restorable(path, key: path)
            declare_restoration(path, key: key)
          end
        end
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
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
    assert_includes execute_failing(host.("restorable :missing").javascript(runtime: "../rb/runtime/runtime.mjs")),
      "Restorable path must start with a declared property: missing"
    assert_includes execute_failing(host.("restorable :query, key: :q\nrestorable :flag, key: :q").javascript(runtime: "../rb/runtime/runtime.mjs")),
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
      .javascript(runtime: "../rb/runtime/runtime.mjs")
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
      .javascript(runtime: "../rb/runtime/runtime.mjs")
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
      compiler.javascript(runtime: "../rb/runtime/runtime.mjs") + <<~JS)
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs")
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
      .add(File.read("rb/framework/core/observable.rb"))
      .add(File.read("rb/framework/core/object.rb"))
      .add(File.read("rb/framework/core/wire.rb"))
      .add(File.read("rb/framework/model/attributes.rb"))
      .add(File.read("rb/framework/model/dirty_tracking.rb"))
      .add(File.read("rb/framework/model/drafts.rb"))
      .add(File.read("rb/framework/model/base.rb"))
      .add(File.read("rb/framework/model/editable.rb"))
      .add(File.read("rb/framework/model/relationships.rb"))
      .add(File.read("rb/framework/model/store.rb"))
      .add(File.read("rb/framework/model/identity.rb"))
      .add(File.read("rb/framework/model/collection.rb"))
      .add(File.read("rb/framework/model/distant_client.rb"))
      .add(File.read("rb/framework/model/distant_data.rb"))
      .add(File.read("rb/framework/model/distant_object.rb"))
      .add(File.read("rb/framework/model/relationship.rb"))
      .add(File.read("rb/framework/model/codec.rb"))
      .add(File.read("rb/framework/model/dataset.rb"))
      .add(File.read("rb/framework/model/resource.rb"))
    compiler = Swill::Ruby2JS::Compiler.new(imports: framework.knowledge.interface)
    compiler.add(File.read("examples/rb/models.rb"))
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs", framework: "./framework.mjs")
    assert_includes js, "class Demo__Person extends Swill__Model__Editable {"
    assert_includes js, "export { Demo__Person };"
    assert_includes js, "mixins: [NormalizeName, StripName, DecorateName]"
    assert_includes js, "constructor: Demo__Person"
    refute_includes js, "Runtime.include("
    refute_match(/class Generated|extends .*?\(|^\s*;\s*$/, js)
    assert_includes js, '"name": {'
    assert_includes js, "function computeLabel()"
    assert_includes js, "Runtime.strip(super.normalize(value))"
    framework_js = framework.javascript(runtime: "../rb/runtime/runtime.mjs")
    assert_includes framework_js, "let copy = new this.constructor"
    refute_includes framework_js, "Runtime.draft("
    assert_equal js, Swill::Ruby2JS::Compiler.format_javascript(js)
  end

  def test_old_model_base_reports_the_explicit_resource_migration
    framework = Swill::Ruby2JS::Compiler.new
    Swill::Ruby2JS::FRAMEWORK_SOURCES.each { |path| framework.add(File.read(path), file: path) }
    compiler = Swill::Ruby2JS::Compiler.new(imports: framework.knowledge.interface)
    error = assert_raises(Swill::Ruby2JS::CompileError) do
      compiler.add(<<~RUBY)
        class OldMenu < Swill::Model::Base
          endpoint "/api/menus"
        end
      RUBY
    end
    assert_includes error.message, "must inherit Swill::Model::Resource"
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
    js = compiler.javascript(runtime: "../rb/runtime/runtime.mjs") + <<~JS
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
    modules = compiler.modules(name: "fixture", runtime: "../rb/runtime/runtime.mjs")
    classes = modules.fetch("fixture.classes.mjs")
    meta = modules.fetch("fixture.meta.mjs")
    entry = modules.fetch("fixture.mjs")
    refute_includes classes, "Runtime.install"
    refute_includes classes, "Runtime.include"
    refute_includes meta, "Runtime.install"
    assert_includes meta, "export const meta"
    assert_includes meta, "constructor: Example"
    assert_equal 1, entry.scan("Runtime.install(meta)").length
    assert_equal modules, compiler.modules(name: "fixture", runtime: "../rb/runtime/runtime.mjs")
    modules.each { |name, source| File.write("build/#{name}", source) }
    assert_equal [true, true, "ADA"], execute(<<~JS)
      import {Runtime} from "../rb/runtime/runtime.mjs";
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
    path = "build/compiler-test-#{Process.pid}.mjs"
    File.write(path, js)
    output, status = Open3.capture2e("deno", "run", "-A", path)
    assert status.success?, output
    JSON.parse(output)
  ensure
    File.delete(path) if File.exist?(path)
  end

  # The bundle's own failure output, for checks that must fail at load time.
  def execute_failing(js)
    path = "build/compiler-test-#{Process.pid}.mjs"
    File.write(path, js)
    output, status = Open3.capture2e("deno", "run", "-A", path)
    refute status.success?, "expected the bundle to fail while installing"
    output
  ensure
    File.delete(path) if File.exist?(path)
  end
end
