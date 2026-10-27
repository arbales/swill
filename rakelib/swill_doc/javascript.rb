# frozen_string_literal: true

require "json"
require "open3"

module SwillDoc
  # The hand-written JavaScript, read with `deno doc` from its JSDoc: the
  # Swill global's own functions, and Swill.Runtime. Pages for them are built
  # from the same components as the class pages.
  class JavaScript
    RUNTIME = File.expand_path("../../rb/runtime", __dir__)
    MODULES = %w[runtime_ui runtime install values paths types properties attributes arguments
                 data_client browser_api].freeze
    GLOBAL_FUNCTIONS = %w[register start install].freeze

    # One documented function.
    Function = Struct.new(:name, :owner, :doc, :params, :tags, :file, :line, :kind) do
      def constant? = kind == "variable"
      def anchor = "function-#{name}"
    end

    # A page of JavaScript: the Swill global, Swill.Runtime, or a source file.
    Page = Struct.new(:path, :title, :kind, :source) do
      def full_name = title
    end

    attr_reader :modules

    def initialize
      files = MODULES.map { |name| File.join(RUNTIME, "#{name}.mjs") }
      output, error, status = Open3.capture3("deno", "doc", "--json", *files)
      raise "deno doc failed: #{error}" unless status.success?
      @modules = JSON.parse(output).fetch("nodes").to_h do |url, node|
        [File.basename(url, ".mjs"), node]
      end
    end

    def runtime_page = Page.new("javascript/Runtime.html", "Swill.Runtime", "Object", "rb/runtime/runtime_ui.mjs")
    def global_page = Page.new("javascript/Swill.html", "Swill", "Global", "rb/runtime/browser_api.mjs")

    def overview(name)
      modules.dig(name, "module_doc", "doc").to_s
    end

    # Swill.Runtime's members in the groups the source gives them, each found
    # in the module it is imported from.
    def runtime_groups
      groups = []
      %w[runtime_ui runtime].each do |name|
        body = File.read(File.join(RUNTIME, "#{name}.mjs"))[/^export const (?:UI)?Runtime = \{\n(.*?)^\};/m, 1]
        body.each_line do |line|
          next if line.include?("...")
          if (title = line[%r{\A\s*//\s*(.+?)\s*\z}, 1])
            groups << [title, []]
          elsif groups.any?
            line.scan(/\b[A-Za-z_]\w*\b/).each do |member|
              function = runtime_function(name, member)
              groups.last[1] << function if function
            end
          end
        end
      end
      groups.reject { |_, functions| functions.empty? }
    end

    def global_functions
      GLOBAL_FUNCTIONS.filter_map { |name| function("browser_api", name, "Swill") }
    end

    # Every documented function, for the method index.
    def all_functions
      global_functions + runtime_groups.flat_map(&:last)
    end

    private

    def runtime_function(module_name, member)
      node = modules.fetch(module_name)
      import = node["imports"].find { |entry| entry["importedName"] == member }
      source = import ? File.basename(import["src"], ".mjs") : module_name
      function(source, import ? import["originalName"] : member, "Swill.Runtime", member)
    end

    def function(module_name, name, owner, as = name)
      symbol = modules.dig(module_name, "symbols")&.find { |candidate| candidate["name"] == name }
      declaration = symbol&.dig("declarations", 0)
      return nil unless declaration
      doc = declaration["jsDoc"] || {}
      location = declaration["location"]
      Function.new(as, owner, doc["doc"].to_s, declaration.dig("def", "params") || [], doc["tags"] || [],
                   "rb/runtime/#{module_name}.mjs", location["line"], declaration["kind"])
    end
  end
end
