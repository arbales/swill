require "rake"
require "fileutils"
require_relative "rb/compiler/build"

ROOT = __dir__
DIST = File.join(ROOT, "rb", "dist")

def compile_spike
  framework = Swill::Ruby2JS::Compiler.new(loader: Swill::Ruby2JS::Loader.framework)
  Swill::Ruby2JS::FRAMEWORK_SOURCES.each do |path|
    framework.add(File.read(path), file: path)
  end
  FileUtils.mkdir_p(DIST)
  FileUtils.mkdir_p("build")
  framework.modules(name: "framework", runtime: "../rb/runtime/runtime.mjs").each do |name, source|
    File.write("build/#{name}", source)
  end
  browser = <<~JAVASCRIPT
    import {Runtime} from "../rb/runtime/runtime.mjs";
    import * as definitions from "./framework.mjs";
    import {browserAPI} from "../rb/runtime/browser_api.mjs";
    if (globalThis.Swill) throw new Error("Framework already loaded");
    globalThis.Swill = browserAPI(definitions, Runtime);
    if (typeof document !== "undefined") new definitions.Swill__Launcher().install(document);
  JAVASCRIPT
  File.write("build/browser.mjs", Swill::Ruby2JS::Compiler.format_javascript(browser))

  # Compiler facts stay in memory. The application bundle imports references
  # from the initialized framework, never another copy of its implementation.
  interface = framework.knowledge.interface
  exports = %w[Runtime] + interface.flat_map do |entry|
    [entry["identifier"], *(entry["extends_class_methods"] ? ["#{entry['identifier']}_ClassMethods"] : [])]
  end
  shim = [
    "const framework = globalThis.Swill;",
    "if (!framework) throw new Error('Load swill.js before app.js');",
    *exports.map { |name| "export const #{name} = framework.#{name};" }
  ].join("\n")
  File.write("build/framework.external.mjs", Swill::Ruby2JS::Compiler.format_javascript(shim))

  application = Swill::Ruby2JS::Compiler.new(imports: interface)
  Swill::Ruby2JS::Build.new("examples/rb").sources.each do |path|
    application.add(File.read(path), file: path)
  end
  application.modules(name: "application", runtime: "./framework.external.mjs",
                      framework: "./framework.external.mjs").each do |name, source|
    File.write("build/#{name}", source)
  end
  rbi = framework.rbi + application.rbi.lines.drop(2).join
  File.write("sorbet/rbi/generated.rbi", rbi)
  File.write("sorbet/rbi/dom.rbi", Swill::Ruby2JS::DOM.rbi)
  FileUtils.mkdir_p("sorbet/checks")
  File.write("sorbet/checks/declarations.rb", framework.type_probes + application.type_probes.lines.drop(2).join)
end

def bundle_spike(minify: false)
  {"browser" => "swill", "application" => "app"}.each do |source, target|
    output = "rb/dist/#{target}#{minify ? '.min' : ''}.js"
    sh "esbuild", "build/#{source}.mjs", "--bundle", "--format=iife", "--target=es2022",
       "--sourcemap", "--outfile=#{output}", *(minify ? ["--minify"] : [])
  end
end

def build_data_fixture_client
  Swill::Ruby2JS::Build.new(
    "spec/fixtures/data/client/app.rb",
    out: "build/data_client.js"
  ).run
end

desc "Generate metadata and swill.js/app.js browser bundles with source maps"
task :build do
  Dir.chdir(ROOT) do
    compile_spike
    bundle_spike
  end
end

desc "Check Ruby source with Sorbet"
task typecheck: :build do
  Dir.chdir(ROOT) { sh "bundle exec srb tc" }
end

desc "Run compiler rejection tests, MRI equivalence, and executable JavaScript checks"
task test: :typecheck do
  Dir.chdir(ROOT) do
    sh "bundle exec ruby spec/compiler_test.rb"
    sh "bundle exec ruby spec/shared_test.rb"
    sh "bundle exec ruby spec/cli_test.rb"
    sh "bundle exec ruby spec/data_test.rb"
    sh "deno test -A spec/runtime_test.mjs"
    sh "deno test -A spec/data_client_test.mjs"
    build_data_fixture_client
    sh "deno test -A spec/data_integration_test.mjs"
    sh "deno test -A spec/bundle_test.mjs"
  end
end

desc "Bundle/minify with the root project's esbuild and execute the result"
task optimize: :build do
  Dir.chdir(ROOT) do
    bundle_spike(minify: true)
    sh({"MINIFIED" => "1"}, "deno", "test", "-A", "spec/bundle_test.mjs")
    require "zlib"
    %w[swill app].each do |name|
      output = File.binread("rb/dist/#{name}.min.js")
      puts "#{name}: #{output.bytesize} bytes minified; #{Zlib.gzip(output).bytesize} bytes gzip (excluding source map)"
    end
  end
end

desc "Exercise the example in headless Chrome (set CHROME_BIN outside macOS)"
task browser: :build do
  Dir.chdir(ROOT) do
    build_data_fixture_client
    sh "deno run -A spec/browser_test.mjs"
    sh "deno run -A spec/data_browser_test.mjs"
  end
end

task default: %i[test optimize]

RDOC_OPTS = [
  "--line-numbers",
  "--markup", "markdown",
  "--title", "Swill: a Cocoa-inspired browser UI framework",
  "--main", "README.md"
]
begin
  gem "hanna"
  RDOC_OPTS.concat(["-f", "hanna"])
rescue Gem::LoadError
  # Stock RDoc renders the same content without hanna's styling.
end

# Undocumented public API under rb/framework/. A ratchet, not a gate: it
# fails when the number grows, and the baseline comes down as the framework
# gets documented. Internals drop out of the count as they are marked :nodoc:.
# Declared properties and outlets count as they do on the class page.
DOC_COVERAGE_BASELINE = 269

desc "Report undocumented public framework API (fails if it grew)"
task :doc_coverage do
  Dir.chdir(ROOT) do
    require_relative "rakelib/sorbet_rdoc"
    require "rdoc/rdoc"
    require "tmpdir"

    gaps = []
    Dir.mktmpdir do |tmp|
      rdoc = RDoc::RDoc.new
      rdoc.document(RDOC_OPTS - ["-f", "hanna"] + ["-q", "-o", File.join(tmp, "out")] + Dir["rb/framework/**/*.rb"])
      rdoc.store.all_classes_and_modules.sort_by(&:full_name).each do |mod|
        gaps << mod.full_name unless mod.documented?
        mod.method_list.each do |method|
          next unless method.visibility == :public
          gaps << "#{mod.full_name}##{method.name}" unless method.documented?
        end
        mod.attributes.each do |attribute|
          gaps << "#{mod.full_name}##{attribute.name}" unless attribute.documented?
        end
      end
    end

    puts gaps
    puts "#{gaps.size} undocumented (baseline #{DOC_COVERAGE_BASELINE})"
    if gaps.size > DOC_COVERAGE_BASELINE
      abort "Documentation coverage regressed: #{gaps.size} > #{DOC_COVERAGE_BASELINE}"
    elsif gaps.size < DOC_COVERAGE_BASELINE
      puts "Coverage improved. Lower DOC_COVERAGE_BASELINE to #{gaps.size}."
    end
  end
end

# RDoc reports an unresolved link or a parse problem as a warning and carries
# on. STRICT=1 fails the build on any, which is how CI runs it.
desc "Generate HTML documentation into rdoc/ (STRICT=1 fails on warnings)"
task :rdoc do
  Dir.chdir(ROOT) do
    require_relative "rakelib/sorbet_rdoc"
    require "rdoc/rdoc"
    require "stringio"
    FileUtils.rm_rf("rdoc")
    files = ["README.md", "LICENSE"] + Dir["doc/*.md"] + Dir["rb/**/*.rb"]

    options = RDOC_OPTS + ["-o", "rdoc"] + files
    next RDoc::RDoc.new.document(options) unless ENV["STRICT"]

    # Quiet, RDoc writes nothing but its warnings, and it writes an unresolved
    # link to standard output rather than standard error, so both are caught.
    reported = StringIO.new
    stdout, stderr = $stdout, $stderr
    $stdout = $stderr = reported
    begin
      RDoc::RDoc.new.document(options + ["-q"])
    ensure
      $stdout, $stderr = stdout, stderr
    end
    abort "#{reported.string}rdoc: failed on the warnings above" unless reported.string.strip.empty?
  end
end

desc "Report non-gating runtime and warm compiler medians"
task benchmark: :build do
  Dir.chdir(ROOT) do
    warm_builds = 3.times.map do
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      compile_spike
      (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1_000
    end
    median = warm_builds.sort[warm_builds.length / 2]
    puts format("warm build: %.2f ms median (%d samples)", median, warm_builds.length)
    sh "deno", "run", "-A", "benchmark/runtime.mjs"
  end
end
