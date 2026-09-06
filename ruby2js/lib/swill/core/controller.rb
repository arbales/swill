# typed: true
# frozen_string_literal: true

module Swill
  class Controller < Responder
    extend T::Sig

    sig { params(element: T.untyped).returns(Controller) }
    def attach(element)
      @view = element.__swill_view__ || View.new(element)
      @view.controller = self
      @teardowns = []
      self
    end

    sig { returns(View) }
    def view
      @view
    end

    sig { params(dispose: T.proc.void).returns(T::Array[T.proc.void]) }
    def register_teardown(dispose)
      @teardowns.push(dispose)
    end

    sig { void }
    def teardown
      view_will_disappear
      @teardowns.forEach { |dispose| dispose.() }
      @teardowns = []
      @view.controller = nil
      view_did_disappear
    end

    sig { void }
    def view_did_load; end

    sig { void }
    def awake_from_dom; end

    sig { void }
    def controller_did_load; end

    sig { void }
    def view_will_appear; end

    sig { void }
    def view_did_appear; end

    sig { void }
    def view_will_disappear; end

    sig { void }
    def view_did_disappear; end
  end
end
