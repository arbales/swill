# frozen_string_literal: true

require "rdoc"
require "rdoc/parser/ruby"

# Teaches RDoc that a Sorbet `sig` block is transparent.
#
# RDoc links a consecutive comment to the next non-blank line. Swill writes the
# doc comment above the sig, so the comment links to the sig line and is
# discarded as a standalone comment before the method beneath it is created.
# Every documented method in rb/framework/ would otherwise render bare.
#
# RDoc already advances that link past blank lines. This advances it past sig
# blocks too, so the comment lands on the method it describes. Source is never
# rewritten to suit the parser.
module SwillRDoc
  module SigAwareComments
    def prepare_comments(comments)
      @swill_sigs = {}
      @line_nodes.each do |line, node|
        next unless sig_call?(node)
        target, sigs = advance_past_sigs(line)
        @swill_sigs[target] ||= sigs.first
      end
      super
      @unprocessed_comments&.each { |entry| entry[0] = advance_past_sigs(entry[0]).first }
    end

    # Records the method's signature for the generator, which renders its
    # types. A method is found again by its file and first line.
    def add_method(method_name, **opts)
      sig = (@swill_sigs ||= {})[opts[:start_line]]
      signature = sig && signature_of(sig)
      Signatures.record(@top_level.relative_name, opts[:start_line], signature) if signature
      super
    end

    private

    # Advances +line+ over any run of sig blocks and the blank lines between
    # them. Answers the first line that is neither, and the sig nodes passed.
    def advance_past_sigs(line)
      sigs = []
      while (node = @line_nodes[line]) && sig_call?(node)
        sigs << node
        line = node.location.end_line + 1
        line += 1 while line <= @lines.size && @lines[line - 1]&.match?(/\A\s*$/)
      end
      [line, sigs]
    end

    def sig_call?(node)
      node.is_a?(Prism::CallNode) && node.name == :sig
    end

    # The parameter names with their types, and the return type, each as
    # written, read from the sig's own AST so that a nested generic's commas
    # cannot be mistaken for argument breaks. "void" when it returns nothing.
    def signature_of(sig)
      statement = sig.block&.body&.body&.first
      return nil unless statement

      params = nil
      returns = nil
      node = statement
      while node.is_a?(Prism::CallNode)
        case node.name
        when :params then params = keyword_types(node)
        when :returns then returns = node.arguments&.arguments&.first&.slice
        when :void then returns = "void"
        end
        node = node.receiver
      end

      Signature.new(params || [], returns)
    rescue StandardError
      nil
    end

    def keyword_types(node)
      hash = node.arguments&.arguments&.first
      return nil unless hash.respond_to?(:elements)
      hash.elements.filter_map do |element|
        next unless element.is_a?(Prism::AssocNode)
        [element.key.slice.delete_suffix(":"), element.value.slice]
      end
    end
  end
end

module SwillRDoc
  Signature = Struct.new(:params, :returns)

  # Signatures by source file and line, filled while parsing.
  module Signatures
    def self.record(file, line, signature)
      table[[file, line]] = signature
    end

    def self.for(method)
      method.file && table[[method.file.relative_name, method.line]]
    end

    def self.table
      @table ||= {}
    end
  end
end

RDoc::Parser::Ruby.prepend(SwillRDoc::SigAwareComments)

# Works around an unguarded nil in RDoc 8.0.0's add_module_or_class.
#
# A compact path such as `class Controller::List < Controller` creates the
# namespace it nests under as a class with no superclass. When the real
# `class Controller < Responder` is parsed afterwards, RDoc reads
# `mod.superclass.name` on that nil and aborts the run. Since files are parsed
# in sorted order, framework/controller/ reaches Controller before
# framework/core/ declares it.
#
# Naming the placeholder's superclass before RDoc compares it takes the branch
# RDoc already intends for an unresolved superclass: the real one replaces it.
module SwillRDoc
  module NameImplicitSuperclass
    def add_module_or_class(module_name, *args, **opts)
      if opts[:is_class] && opts[:superclass_name]
        owner, name = find_or_create_lexical_constant_owner_name(module_name)
        placeholder = owner&.classes_hash&.[](name)
        placeholder.superclass = "::Object" if placeholder && placeholder.superclass.nil?
      end
      super
    end
  end
end

RDoc::Parser::Ruby.prepend(SwillRDoc::NameImplicitSuperclass)

# Documents `property`, `outlet` and `attribute` declarations as RDoc handles
# `attr_accessor`: the comment above the declaration becomes its description,
# and it is listed on the class page. The declaration's keywords are kept, so
# the page can show the type and default as they were written.
#
# A module declares for its includers with `base.property` inside
# `def self.included(base)`; those are documented as the module's own.
module SwillRDoc
  class Declaration < RDoc::Attr
    # "property", "outlet" or "attribute".
    attr_accessor :declared_as

    # The type: argument, as written.
    attr_accessor :declared_type

    # The default: argument, as written, or nil.
    attr_accessor :default

    attr_accessor :optional, :computed

    def outlet?
      declared_as == "outlet"
    end
  end

  module DeclaredProperties
    MACROS = %i[property outlet attribute].freeze

    def visit_call_node(node)
      return super unless node.receiver.nil? && MACROS.include?(node.name)

      @scanner.process_comments_until(node.location.start_line - 1)
      return if @scanner.in_proc_block
      declaration = declaration_for(node)
      return super unless declaration
      @scanner.add_declaration(declaration, node.location.start_line)
    end

    # RDoc does not look inside a method body, so the included hook's
    # declarations are read here, before its comments are skipped.
    def visit_def_node(node)
      after = node.location.start_line
      included_declarations(node).each do |call, declaration|
        line = call.location.start_line
        @scanner.process_inner_directives(after, line)
        @scanner.add_inner_declaration(declaration, line)
        after = line
      end
      super
    end

    private

    def included_declarations(node)
      return [] unless node.receiver.is_a?(Prism::SelfNode) && node.name == :included && !@scanner.in_proc_block
      base = node.parameters&.requireds&.first
      return [] unless base.is_a?(Prism::RequiredParameterNode) && node.body.is_a?(Prism::StatementsNode)

      node.body.body.filter_map do |call|
        next unless call.is_a?(Prism::CallNode) && MACROS.include?(call.name)
        next unless call.receiver.is_a?(Prism::LocalVariableReadNode) && call.receiver.name == base.name
        declaration = declaration_for(call)
        [call, declaration] if declaration
      end
    end

    # A computed property is read-only unless it names a writer.
    def declaration_for(node)
      name = node.arguments&.arguments&.first
      return unless name.is_a?(Prism::SymbolNode)

      keywords = declaration_keywords(node)
      read_only = node.block && !keywords.key?("writer")
      declaration = Declaration.new(name.value, read_only ? "R" : "RW", nil, singleton: false)
      declaration.declared_as = node.name.to_s
      declaration.declared_type = keywords["type"]
      declaration.default = keywords["default"]
      declaration.optional = keywords["optional"] == "true"
      declaration.computed = !node.block.nil?
      declaration
    end

    def declaration_keywords(node)
      hash = node.arguments.arguments.find { |argument| argument.is_a?(Prism::KeywordHashNode) }
      return {} unless hash
      hash.elements.each_with_object({}) do |element, keywords|
        next unless element.is_a?(Prism::AssocNode) && element.key.is_a?(Prism::SymbolNode)
        keywords[element.key.value] = element.value.slice
      end
    end
  end

  module DeclarationScanner
    # add_attributes, for one declaration built by the visitor.
    def add_declaration(declaration, line_no)
      comment, directives, = consecutive_comment(line_no)
      handle_code_object_directives(@container, directives) if directives
      return unless @container.document_children

      declaration.comment = comment
      declaration.store = @store
      declaration.line = line_no
      record_location(declaration)
      handle_modifier_directive(declaration, line_no)
      @container.add_attribute(declaration) if should_document?(declaration)
      declaration.visibility = visibility
    end

    # Standalone comments inside a method body, between two lines, read for
    # their directives: a `:section:` there applies to the declarations that
    # follow it, as it would in a class body.
    def process_inner_directives(after_line, before_line)
      inner = @unprocessed_comments.select { |line_no, _, _| line_no > after_line && line_no < before_line }
      inner.each do |entry|
        @unprocessed_comments.delete(entry)
        _line_no, start_line, text = entry
        _comment, directives = parse_comment_text_to_directives(text, start_line)
        handle_code_object_directives(@container, directives) if directives
      end
    end

    # add_declaration, for one inside a method body: its comment is brought
    # to the front, ahead of the comment on the method itself.
    def add_inner_declaration(declaration, line_no)
      index = @unprocessed_comments.index { |entry| entry.first == line_no }
      @unprocessed_comments.unshift(@unprocessed_comments.delete_at(index)) if index
      add_declaration(declaration, line_no)
    end
  end
end

RDoc::Parser::Ruby.prepend(SwillRDoc::DeclarationScanner)
RDoc::Parser::Ruby::RDocVisitor.prepend(SwillRDoc::DeclaredProperties)
