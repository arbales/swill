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
    sh "node --test spec/runtime_test.mjs"
    sh "node --test spec/data_client_test.mjs"
    build_data_fixture_client
    sh "node --test spec/data_integration_test.mjs"
    sh "node --test spec/bundle_test.mjs"
  end
end

desc "Bundle/minify with the root project's esbuild and execute the result"
task optimize: :build do
  Dir.chdir(ROOT) do
    bundle_spike(minify: true)
    sh({"MINIFIED" => "1"}, "node", "--test", "spec/bundle_test.mjs")
    require "zlib"
    %w[swill app].each do |name|
      output = File.binread("rb/dist/#{name}.min.js")
      puts "#{name}: #{output.bytesize} bytes minified; #{Zlib.gzip(output).bytesize} bytes gzip (excluding source map)"
    end
  end
end

desc "Exercise the example in headless Chrome (set CHROME_BIN outside macOS)"
task browser: :build do
  Dir.chdir(ROOT) { sh "node spec/browser_test.mjs" }
end

task default: %i[test optimize]

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
    sh "node", "benchmark/runtime.mjs"
  end
end
