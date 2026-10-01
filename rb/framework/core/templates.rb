# typed: true
# frozen_string_literal: true

module Swill
  # Named `<template>`s, read from the HTML catalogs among the bundles'
  # resources: the application's first, so it can ship templates of its own
  # or replace the framework's, then the framework's. A catalog is parsed
  # once per document. The build embeds catalogs, so controls find their
  # templates without waiting; one loaded later with Bundle#load_resource is
  # found the same way.
  module Templates
    extend T::Sig

    # The template called +name+, parsed for +document+. Raises "Unknown
    # control template: ..." when no loaded catalog has it, naming any
    # catalog that is listed but not loaded yet.
    sig { params(name: String, document: Document).returns(HTMLTemplateElement) }
    def self.named(name, document)
      unloaded = T.let([], T::Array[String])
      found = T.let(nil, T.nilable(HTMLTemplateElement))
      Bundle.search_order.each do |bundle|
        bundle.manifest.select { |path| path.end_with?(".html") }.each do |path|
          next if found
          source = bundle.loaded_path(path)
          if source
            found = Templates.find(Templates.catalog(document, bundle, path, source), name)
          else
            unloaded << "#{bundle.name}/#{path}"
          end
        end
      end
      return found if found
      hint = unloaded.empty? ? "" : " (not loaded yet: #{unloaded.join(', ')}; await Bundle#load_resource first)"
      raise "Unknown control template: #{name}#{hint}"
    end

    # The parsed catalog for +path+ in +bundle+, kept on the document.
    sig do
      params(document: Document, bundle: Bundle, path: String, source: String).returns(HTMLTemplateElement)
    end
    def self.catalog(document, bundle, path, source) # :nodoc:
      catalogs = document.__swill_templates__
      unless catalogs
        catalogs = {}
        document.__swill_templates__ = catalogs
      end
      key = "#{bundle.name}/#{path}"
      catalog = catalogs[key]
      unless catalog
        catalog = T.cast(document.createElement("template"), HTMLTemplateElement)
        catalog.innerHTML = source
        catalogs[key] = catalog
      end
      catalog
    end

    sig { params(catalog: HTMLTemplateElement, name: String).returns(T.nilable(HTMLTemplateElement)) }
    def self.find(catalog, name) # :nodoc:
      templates = catalog.content.children
      index = 0
      while index < templates.length
        template = T.must(templates[index])
        return T.cast(template, HTMLTemplateElement) if template.getAttribute("name") == name
        index += 1
      end
      nil
    end
  end
end
