# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # `Drafts` adds editing through a detached copy: `draft` returns a copy
    # of the model that remembers its original, and `apply_draft` on the
    # original takes the copy's attributes back. A draft is for edits that
    # must not show through the shared object until they are accepted.
    #
    #     draft = contact.draft
    #     draft.name = "Grace"
    #     contact.apply_draft(draft)
    #
    # See [Models](rdoc-ref:doc/models.md).
    module Drafts
      extend T::Sig

      # Returns a new instance of the model's class holding every attribute
      # of this object, made from this object: `draft?` is true on the copy
      # and `draft_of?` names this object. The copy is clean.
      sig { returns(T.untyped) }
      def draft
        copy = self.class.new
        copy.apply_attributes(collect_attributes)
        copy.draft_original = self
        copy
      end

      # Applies the attributes of `copy`, a draft made by this object, to
      # this object and returns it. The application is clean, as any
      # `apply_attributes` is; the values passed the validators when the
      # draft was written. Raises when `copy` was not drafted from this
      # object.
      sig { params(copy: T.untyped).returns(T.untyped) }
      def apply_draft(copy)
        raise "apply_draft requires a draft made from this object" unless copy.draft_of?(self)
        apply_attributes(copy.collect_attributes)
        self
      end

      # Whether this object is a draft made by `draft`.
      sig { returns(T::Boolean) }
      def draft?
        !!@draft_original
      end

      # Whether this object is a draft made from `original`.
      sig { params(original: T.untyped).returns(T::Boolean) }
      def draft_of?(original)
        @draft_original == original
      end

      protected

        # Records `original` as the object this copy was drafted from. `draft`
        # sets it on the copy it makes; protected so that a subclass's own
        # `draft` can do the same and nothing else can.
        sig { params(original: T.untyped).void }
        def draft_original=(original)
          @draft_original = original
        end
    end
  end
end
