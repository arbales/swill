# frozen_string_literal: true

require "erb"
require "fileutils"
require "json"
require "rdoc"
require "rdoc/generator/markup"
require "rouge"
require_relative "page_helpers"
require_relative "javascript"
require_relative "javascript_spelling"

module SwillDoc
  # A link to code reads as code, whether the source named it in backticks,
  # in prose, or behind its own label. RDoc already skips the code treatment
  # for a link to a page, which stays prose.
  module CodeCrossReferences
    def link(name, html_string, _code = true, rdoc_ref: false)
      super(name, html_string, !html_string.to_s.include?("<code>"), rdoc_ref: rdoc_ref)
    end
  end
end

RDoc::Markup::ToHtmlCrossref.prepend(SwillDoc::CodeCrossReferences)

module SwillDoc
  # RDoc highlights Ruby itself; a block in another language Rouge knows,
  # such as html or sh, is highlighted by Rouge. Plain text stays plain.
  module HighlightedCode
    def accept_verbatim(verbatim)
      lexer = !verbatim.ruby? && verbatim.format && Rouge::Lexer.find(verbatim.format.to_s)
      return super unless lexer && !@pipe
      html = Rouge::Formatters::HTML.new.format(lexer.lex(verbatim.text.rstrip))
      @res << %(\n<pre class="#{verbatim.format}">#{html}</pre>\n)
    end
  end
end

RDoc::Markup::ToHtml.prepend(SwillDoc::HighlightedCode)

# Swill's documentation generator: `rdoc -f swill`.
#
# Every class, module, and guide is a complete static page at the path RDoc
# gives it, so RDoc's cross-references resolve unchanged and any page can be
# linked to or opened from disk. The left pane is a small Swill application
# (assets/navigator.js) over search_index.js, running on the UI build.
class RDoc::Generator::Swill
  RDoc::RDoc.add_generator self

  DESCRIPTION = "Swill's documentation pages"

  ASSETS = File.expand_path("assets", __dir__)
  TEMPLATES = File.expand_path("templates", __dir__)
  UI_BUILD = File.expand_path("../../rb/dist/swill-ui.min.js", __dir__)

  include ERB::Util
  include SwillDoc::PageHelpers
  include SwillDoc::JavaScriptSpelling

  attr_reader :store, :options

  def initialize(store, options)
    @store = store
    @options = options
    @templates = {}
    # Constructed before RDoc moves into the output directory; the sources
    # are read relative to here.
    @source_root = Dir.pwd
  end

  # Called from inside the output directory.
  def generate
    classes = @store.all_classes_and_modules.select(&:display?).sort_by(&:full_name)
    pages = @store.all_files.select(&:text?).sort_by { |page| page_name(page) }

    classes.each { |klass| write(klass.path, render_page("class", klass, klass: klass)) }
    pages.each { |page| write(page.path, render_page("page", page, page: page)) }
    sources.each do |file|
      source = File.read(File.expand_path(file.relative_name, @source_root))
      defined = file.classes_or_modules.select(&:display?).sort_by(&:full_name)
      page = SwillDoc::JavaScript::Page.new(file.path, file.relative_name, "File", nil)
      write(file.path, render_source(page, source, defined) { |klass| class_link(klass) })
    end

    javascript = SwillDoc::JavaScript.new
    write_javascript(javascript)
    write("search_index.js", search_index(classes, pages, javascript))
    copy_assets
    write(".nojekyll", "")
  end

  def render_source(page, source, defined, &link)
    @context = page
    lines = page.path.end_with?("_mjs.html") ? highlighted_javascript_lines(source) : highlighted_lines(source)
    language = page.path.end_with?("_mjs.html") ? "javascript" : "ruby"
    body = partial("source", path_text: page.title, lines: lines, language: language, defined: link ? defined.map(&link) : [])
    partial("layout", context: page, root: "../" * page.path.count("/"), body: body)
  end

  # Swill.Runtime and the Swill global, and a source page for each module
  # they come from.
  def write_javascript(javascript)
    swill = @store.find_class_or_module("Swill")
    classes = ::Swill::Ruby2JS::JAVASCRIPT_NAMES.map { |name, ruby| [name, @store.find_class_or_module(ruby)] }
    [[javascript.global_page, "browser_api", [["Functions", javascript.global_functions]], classes],
     [javascript.runtime_page, "runtime_ui", javascript.runtime_groups, []]].each do |page, name, groups, listed|
      write(page.path, render_page("javascript", page, page: page, overview: javascript.overview(name),
                                                      groups: groups, classes: listed))
    end
    SwillDoc::JavaScript::MODULES.each do |name|
      relative = "rb/runtime/#{name}.mjs"
      page = SwillDoc::JavaScript::Page.new(relative.tr(".", "_") + ".html", relative, "File", nil)
      write(page.path, render_source(page, File.read(File.join(@source_root, relative)), []))
    end
    swill
  end

  # The Ruby files that define something documented; each gets a page of
  # its source, which class pages link to.
  def sources
    @store.all_files.reject(&:text?).select { |file| file.classes_or_modules.any?(&:display?) }
  end

  # Not used: this generator's paths are RDoc's own.
  def class_dir = nil
  def file_dir = nil

  private

  def render_page(name, context, **locals)
    @context = context
    root = "../" * context.path.count("/")
    partial("layout", context: context, root: root, body: partial(name, **locals))
  end

  # Renders templates/name.html.erb with the helpers and +locals+ in scope.
  def partial(name, **locals)
    scope = binding
    locals.each { |key, value| scope.local_variable_set(key, value) }
    template(name).result(scope)
  end

  def template(name)
    @templates[name] ||= ERB.new(File.read(File.join(TEMPLATES, "#{name}.html.erb")), trim_mode: "-")
  end

  def write(path, content)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, content)
  end

  # The navigator's data. A script rather than JSON, so pages opened from disk
  # can load it: browsers refuse fetch() on file:// but not <script>.
  def search_index(classes, pages, javascript)
    index = {
      files: pages.map { |page| {name: page_name(page), url: page.path} },
      classes: classes.map do |klass|
        namespace, _, leaf = klass.full_name.rpartition("::")
        javascript_name = public_javascript_name(klass.full_name)
        js_space, _, js_leaf = javascript_name.to_s.rpartition(".")
        {name: klass.full_name, namespace: namespace.empty? ? "" : "#{namespace}::", leaf: leaf, url: klass.path,
         search: [klass.full_name, javascript_name].compact.join(" "),
         internal: !javascript_name,
         js: javascript_name && {name: javascript_name, namespace: "#{js_space}.", leaf: js_leaf}}
      end,
      methods: classes.flat_map do |klass|
        owner = public_javascript_name(klass.full_name) || klass.full_name
        klass.method_list.select { |method| method.visibility == :public }.map do |method|
          prefix = method.singleton ? "." : "#"
          names = javascript_names(klass, method)
          {label: "#{prefix}#{method.name}", owner: klass.full_name,
           search: ([method.name, klass.full_name, owner] + names).uniq.join(" "),
           url: "#{klass.path}##{method.aref}",
           js: {label: "#{prefix}#{names.first}", owner: owner}}
        end
      end.concat(javascript.all_functions.map do |function|
        page = function.owner == "Swill" ? javascript.global_page : javascript.runtime_page
        {label: ".#{function.name}", owner: function.owner, search: "#{function.name} #{function.owner}",
         url: "#{page.path}##{function.anchor}"}
      end).sort_by { |entry| [entry[:label].delete_prefix("#").delete_prefix("."), entry[:owner]] }
    }
    index[:classes].concat([
      {name: "Swill", namespace: "", leaf: "Swill (JavaScript global)", url: javascript.global_page.path,
       search: "Swill global"},
      {name: "Swill.Runtime", namespace: "Swill.", leaf: "Runtime", url: javascript.runtime_page.path,
       search: "Swill.Runtime"}
    ])
    index[:classes].sort_by! { |entry| entry[:name] }
    "globalThis.SwillDocIndex = #{JSON.generate(index)};\n"
  end

  def copy_assets
    FileUtils.cp_r(Dir[File.join(ASSETS, "*")], ".")
    FileUtils.cp(UI_BUILD, "swill-ui.min.js")
  end
end
