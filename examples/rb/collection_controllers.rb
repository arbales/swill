# typed: true
# frozen_string_literal: true

module Demo
  # The same filter works on a list, a standalone array controller, or a view controller.
  module PersonFilter
    extend T::Sig

    sig { params(base: T.class_of(Swill::Object)).void }
    def self.included(base)
      base.property :filter_text, type: String, default: ""
    end

    sig { params(object: T.untyped).returns(T::Boolean) }
    def includes_object?(object)
      T.cast(object, Person).name.downcase.include?(filter_text.downcase)
    end
  end

  class FilteredPeopleList < Swill::Controller::SortableList
    include PersonFilter
  end

  class PeopleArrayController < Swill::ArrayController
    include PersonFilter
  end

  class FilteredPeopleController < Swill::Controller
    include Swill::CollectionArrangement
    include PersonFilter
  end
end
