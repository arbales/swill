# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # Attribute editing shared by local models and both persistence strategies.
    class Editable < Base
      include DirtyTracking
      include Drafts
    end
  end
end
