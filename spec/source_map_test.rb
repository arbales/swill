require "minitest/autorun"
require "json"
require "open3"
require "tmpdir"
require_relative "../rb/compiler/build"

class SourceMapTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)
  FIXTURE = File.join(__dir__, "fixtures/source_maps/app.rb")

  # An independent consumer checks the emitted maps, not the composer's own
  # decoder. Positions in the source-map format are zero-based.
  def original_position(javascript, map, token)
    Dir.mktmpdir do |dir|
      input = File.join(dir, "input.json")
      File.write(input, JSON.generate(javascript: javascript, map: map, token: token))
      script = <<~JS
        import {SourceMap} from "node:module";
        const {javascript, map, token} = JSON.parse(Deno.readTextFileSync(Deno.args[0]));
        const offset = javascript.indexOf(token);
        if (offset < 0) throw new Error(`Missing token: ${token}`);
        const prefix = javascript.slice(0, offset).split("\\n");
        const position = new SourceMap(map).findEntry(prefix.length - 1, prefix.at(-1).length);
        console.log(JSON.stringify(position));
      JS
      output, status = Open3.capture2e("deno", "eval", script, input)
      assert status.success?, output
      JSON.parse(output)
    end
  end

  def assert_fixture_position(javascript, map, token, directory: ROOT)
    position = original_position(javascript, map, token)
    assert_equal FIXTURE, File.expand_path(position.fetch("originalSource"), directory)
    source = File.read(FIXTURE)
    row = source.lines.index { |line| line.include?(token) }
    assert_equal row, position["originalLine"]
    assert_equal source.lines[row].index(token), position["originalColumn"]
  end

  def test_second_class_uses_file_relative_lines_and_columns
    compiler = Swill::Ruby2JS::Compiler.new.add(File.read(FIXTURE), file: FIXTURE)
    modules = compiler.modules(name: "fixture", runtime: "./runtime.mjs", sourcemaps: true)
    javascript = modules.fetch("fixture.classes.mjs")
    map = JSON.parse(modules.fetch("fixture.classes.mjs.map"))
    assert_includes javascript, "//# sourceMappingURL=fixture.classes.mjs.map"
    assert_equal [FIXTURE], map.fetch("sources")
    assert_equal [File.read(FIXTURE)], map.fetch("sourcesContent")
    assert_fixture_position(javascript, map, '"first_token"')
    assert_fixture_position(javascript, map, '"second_token"')
    refute modules.key?("fixture.meta.mjs.map"), "generated metadata stays unmapped"
    assert_equal modules, compiler.modules(name: "fixture", runtime: "./runtime.mjs", sourcemaps: true)
  end

  def test_cli_build_composes_ruby_maps_in_normal_and_minified_outputs
    Dir.mktmpdir do |dir|
      [false, true].each do |minify|
        output = File.join(dir, minify ? "app.min.js" : "app.js")
        arguments = ["build", FIXTURE, "--out", output]
        arguments << "--minify" if minify
        log, status = Open3.capture2e(RbConfig.ruby, File.join(ROOT, "exe/swill"), *arguments)
        assert status.success?, log
        map = JSON.parse(File.read("#{output}.map"))
        assert_fixture_position(File.read(output), map, '"second_token"', directory: dir)
        if minify
          refute map.key?("sourcesContent"), "optimized maps carry locations, not source contents"
        else
          index = map.fetch("sources").index { |source| source.end_with?("/source_maps/app.rb") }
          refute_nil index
          assert_equal File.read(FIXTURE), map.fetch("sourcesContent")[index]
        end
      end
    end
  end

  def test_error_constructor_maps_to_the_ruby_raise
    compiler = Swill::Ruby2JS::Compiler.new.add(File.read(FIXTURE), file: FIXTURE)
    modules = compiler.modules(name: "fixture", runtime: "./runtime.mjs", sourcemaps: true)
    map = JSON.parse(modules.fetch("fixture.classes.mjs.map"))
    position = original_position(modules.fetch("fixture.classes.mjs"), map, "new Error(")
    source = File.read(FIXTURE)
    row = source.lines.index { |line| line.include?('raise "source_map_probe"') }
    assert_equal FIXTURE, position["originalSource"]
    assert_equal row, position["originalLine"]
    assert_equal source.lines[row].index("raise"), position["originalColumn"]
  end

  def test_composer_reindexes_sources_and_names_and_keeps_wrappers_unmapped
    composer = Swill::Ruby2JS::SourceMap.new
    composer.append("wrapper")
    composer.append("first\nsecond", map: {
      "sources" => ["first.rb", "second.rb"], "names" => ["left", "right"],
      "sourcesContent" => ["first source", "second source"],
      "mappings" => "AAAAA;ACCEC"
    })
    composer.append("generated")
    composer.append("third\nfourth", map: {
      "sources" => ["second.rb", "first.rb"], "names" => ["right", "left"],
      "sourcesContent" => ["second source", "first source"],
      "mappings" => "AAAAA;ACCEC"
    })
    map = composer.to_h(file: "combined.js")
    assert_equal ["first.rb", "second.rb"], map["sources"]
    assert_equal ["left", "right"], map["names"]
    assert_equal ["first source", "second source"], map["sourcesContent"]
    rows = Swill::Ruby2JS::SourceMap.decode(map["mappings"])
    assert_equal [0, 1, 1, 0], [1, 2, 4, 5].map { |row| rows[row].first[4] }
    expected = {
      "first" => ["first.rb", 0, 0], "second" => ["second.rb", 1, 2],
      "third" => ["second.rb", 0, 0], "fourth" => ["first.rb", 1, 2]
    }
    expected.each do |token, location|
      position = original_position(composer.to_s, map, token)
      assert_equal location, position.values_at("originalSource", "originalLine", "originalColumn")
    end
    %w[wrapper generated].each do |token|
      refute original_position(composer.to_s, map, token).key?("originalSource")
    end
  end

  def test_vlq_signed_deltas_and_row_resets
    codec = Swill::Ruby2JS::SourceMap
    rows = [
      [[0, 0, 0, 0, 0], [4, 1, 31, 32, 1]],
      [[0, 0, 1, 0, 0], [7]], [],
      [[0, 2, 1000, 65, 3]]
    ]
    assert_equal rows, codec.decode(codec.encode(rows))
    assert_equal [[[0, 0, 0, 0], [1, 0, 0, 1]], [[0, 0, 1, 1]]],
                 codec.decode("AAAA,CAAC;AACA")
    ["!", "g", "AA"].each { |mapping| assert_raises(ArgumentError) { codec.decode(mapping) } }
  end

  def test_standard_maps_already_use_utf16_generated_columns
    composer = Swill::Ruby2JS::SourceMap.new
    composer.append("😀token", map: {
      "sources" => ["original.rb"], "names" => [], "mappings" => "EAAA"
    })
    position = original_position(composer.to_s, composer.to_h(file: "combined.js"), "token")
    assert_equal "original.rb", position["originalSource"]
    assert_equal 2, position["generatedColumn"]
  end

  def test_reopened_class_methods_keep_their_original_file_positions
    first = <<~RUBY

      module Mapping
        class Reopened
          def before
            "before_token"
          end
          def replaced
            "obsolete_token"
          end
        end
      end
    RUBY
    second = <<~RUBY


      module Mapping
        class Reopened
          def replaced
            "replacement_token"
          end
        end
      end
    RUBY
    compiler = Swill::Ruby2JS::Compiler.new
    compiler.add(first, file: File.join(ROOT, "before.rb"))
    compiler.add(second, file: File.join(ROOT, "replacement.rb"))
    modules = compiler.modules(name: "fixture", runtime: "./runtime.mjs", sourcemaps: true)
    javascript = modules.fetch("fixture.classes.mjs")
    map = JSON.parse(modules.fetch("fixture.classes.mjs.map"))
    refute_includes javascript, "obsolete_token"
    {first => ['"before_token"', "before.rb"], second => ['"replacement_token"', "replacement.rb"]}.each do |source, (token, file)|
      position = original_position(javascript, map, token)
      row = source.lines.index { |line| line.include?(token) }
      assert_equal File.join(ROOT, file), position["originalSource"]
      assert_equal row, position["originalLine"]
      assert_equal source.lines[row].index(token), position["originalColumn"]
      index = map["sources"].index(position["originalSource"])
      assert_equal source, map["sourcesContent"][index]
    end
  end

  def test_mixin_module_functions_and_class_methods_map_through_generated_wrappers
    source = <<~RUBY
      module MappedFeature
        def self.included(base); base.extend(ClassMethods); end
        def self.utility
          "module_token"
        end
        def label
          "mixin_token"
        end
        module ClassMethods
          def category
            "class_token"
          end
        end
      end
      class MappedClass
        include MappedFeature
      end
    RUBY
    compiler = Swill::Ruby2JS::Compiler.new.add(source, file: File.join(ROOT, "feature.rb"))
    modules = compiler.modules(name: "fixture", runtime: "./runtime.mjs", sourcemaps: true)
    map = JSON.parse(modules.fetch("fixture.classes.mjs.map"))
    %w[module_token mixin_token class_token].each do |word|
      token = word.inspect
      position = original_position(modules.fetch("fixture.classes.mjs"), map, token)
      row = source.lines.index { |line| line.include?(token) }
      assert_equal File.join(ROOT, "feature.rb"), position["originalSource"]
      assert_equal row, position["originalLine"]
      assert_equal source.lines[row].index(token), position["originalColumn"]
    end
  end

  def test_columns_use_utf16_after_non_ascii_text
    source = 'class Unicode; def label; ["é😀", "unicode_token"]; end; end'
    compiler = Swill::Ruby2JS::Compiler.new.add(source, file: File.join(ROOT, "unicode.rb"))
    modules = compiler.modules(name: "fixture", runtime: "./runtime.mjs", sourcemaps: true)
    map = JSON.parse(modules.fetch("fixture.classes.mjs.map"))
    token = '"unicode_token"'
    position = original_position(modules.fetch("fixture.classes.mjs"), map, token)
    assert_equal 0, position["originalLine"]
    assert_equal source[0, source.index(token)].encode("UTF-16LE").bytesize / 2, position["originalColumn"]
  end

  def test_generated_default_argument_shims_have_no_fabricated_ruby_location
    source = <<~RUBY
      class Defaults
        def greeting(name = "synthetic_token")
          name
        end
      end
    RUBY
    compiler = Swill::Ruby2JS::Compiler.new.add(source, file: File.join(ROOT, "defaults.rb"))
    modules = compiler.modules(name: "fixture", runtime: "./runtime.mjs", sourcemaps: true)
    map = JSON.parse(modules.fetch("fixture.classes.mjs.map"))
    position = original_position(modules.fetch("fixture.classes.mjs"), map, '"synthetic_token"')
    refute position.key?("originalSource")
  end
end
