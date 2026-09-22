# frozen_string_literal: true

require_relative "rb/compiler/version"

Gem::Specification.new do |spec|
  spec.name = "swill"
  spec.version = Swill::Ruby2JS::VERSION
  spec.summary = "Compile a Swill application from Ruby to browser JavaScript"
  spec.description = <<~TEXT
    Swill is a Cocoa-inspired browser UI framework. This gem carries the
    framework's Ruby, the JavaScript runtime it installs into, a prebuilt
    swill.js for the page to load, and the `swill` command that compiles an
    application's Ruby into one script. No Ruby runtime is shipped to the
    browser: unsupported Ruby is rejected at build time with a file and line.
  TEXT
  spec.authors = ["Austin Bales"]
  spec.email = ["arbales@gmail.com"]
  spec.homepage = "https://github.com/arbales/swill"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.2"

  # Not publishable to rubygems.org while its ruby2js dependency lives on a
  # git branch; install from the repository with Bundler instead.
  spec.metadata = {
    "source_code_uri" => spec.homepage,
    "allowed_push_host" => "https://example.invalid",
    "rubygems_mfa_required" => "true"
  }

  # The compiler, the framework Ruby it compiles, the MRI host that runs its
  # declarations, the JavaScript runtime, the prebuilt bundles a page loads,
  # and the handwritten RBI a consumer types against.
  spec.files =
    Dir["rb/**/*.{rb,mjs}"] +
    Dir["rb/dist/swill*.{js,map}"] +
    Dir["sorbet/rbi/runtime.rbi"] +
    Dir["doc/*.rdoc"] +
    ["README.rdoc", "LICENSE", "swill.gemspec"].select { |path| File.file?(path) }

  spec.extra_rdoc_files = ["README.rdoc", "LICENSE"] + Dir["doc/*.rdoc"]
  spec.rdoc_options = [
    "--quiet", "--line-numbers", "--inline-source",
    "--title", "Swill: a Cocoa-inspired browser UI framework",
    "--main", "README.rdoc"
  ]
  spec.bindir = "exe"
  spec.executables = ["swill"]
  spec.require_paths = ["rb"]

  # Ruby2JS supplies the converter and the Pragma filter this compiler extends.
  # No released ruby2js carries that filter: 5.1.2 on rubygems does not have
  # it, and the version on master reports the same number. So the dependency
  # is declared, but a consumer must point it at the git source themselves:
  #
  #   gem "ruby2js", git: "https://github.com/ruby2js/ruby2js.git", branch: "master"
  #
  # Loading the compiler without it raises a LoadError saying exactly that.
  spec.add_dependency "ruby2js", ">= 5.1.2"
  # Declarations carry Sorbet signatures, and the compiler reads them by
  # reflection when it loads an application's Ruby.
  spec.add_dependency "sorbet-runtime", ">= 0.5"
  spec.add_dependency "msgpack", ">= 1.7"
  spec.add_dependency "sequel", ">= 5"
  spec.add_dependency "sequel-privacy", ">= 0.7.2"

  # esbuild is required on PATH: it formats generated JavaScript and bundles
  # the application. It is not a gem.
  spec.post_install_message = "swill needs esbuild on PATH to format and bundle."
end
