# typed: true
# frozen_string_literal: true

module Swill
  # Shared HTML, embedded by the build and parsed once per document.
  module Templates
    extend T::Sig

    sig { params(source: String).void }
    def self.install(source)
      @source = T.let(source, T.nilable(String))
    end

    sig { params(name: String, document: Document).returns(HTMLTemplateElement) }
    def self.named(name, document)
      catalog = document.__swill_templates__
      unless catalog
        catalog = T.cast(document.createElement("template"), HTMLTemplateElement)
        catalog.innerHTML = T.must(@source)
        document.__swill_templates__ = catalog
      end
      templates = catalog.content.children
      index = 0
      while index < templates.length
        template = T.must(templates[index])
        return T.cast(template, HTMLTemplateElement) if template.getAttribute("name") == name
        index += 1
      end
      raise "Unknown control template: #{name}"
    end
  end
end
