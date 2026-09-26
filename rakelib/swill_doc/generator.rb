# frozen_string_literal: true

require "erb"
require "fileutils"
require "json"
require "rdoc"
require "rdoc/generator/markup"
require "rouge"
require_relative "page_helpers"

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
      write(file.path, render_page("source", file, file: file, source: source))
    end
    write("search_index.js", search_index(classes, pages))
    copy_assets
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
  def search_index(classes, pages)
    index = {
      files: pages.map { |page| {name: page_name(page), url: page.path} },
      classes: classes.map do |klass|
        namespace, _, leaf = klass.full_name.rpartition("::")
        {name: klass.full_name, namespace: namespace.empty? ? "" : "#{namespace}::", leaf: leaf, url: klass.path}
      end,
      methods: classes.flat_map do |klass|
        klass.method_list.select { |method| method.visibility == :public }.map do |method|
          label = "#{method.singleton ? '.' : '#'}#{method.name}"
          {label: label, owner: klass.full_name, search: "#{method.name} #{klass.full_name}",
           url: "#{klass.path}##{method.aref}"}
        end
      end.sort_by { |entry| [entry[:label].delete_prefix("#").delete_prefix("."), entry[:owner]] }
    }
    "globalThis.SwillDocIndex = #{JSON.generate(index)};\n"
  end

  def copy_assets
    FileUtils.cp_r(Dir[File.join(ASSETS, "*")], ".")
    FileUtils.cp(UI_BUILD, "swill-ui.min.js")
  end
end
