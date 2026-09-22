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
      super
      @unprocessed_comments&.each { |entry| entry[0] = advance_past_sigs(entry[0]) }
    end

    private

    # Advances +line+ over any run of sig blocks and the blank lines between
    # them, returning the first line that is neither.
    def advance_past_sigs(line)
      while (node = @line_nodes[line]) && sig_call?(node)
        line = node.location.end_line + 1
        line += 1 while line <= @lines.size && @lines[line - 1]&.match?(/\A\s*$/)
      end
      line
    end

    def sig_call?(node)
      node.is_a?(Prism::CallNode) && node.name == :sig
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

