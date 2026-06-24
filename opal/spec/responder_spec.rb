# frozen_string_literal: true

# Pure-Ruby spec for the responder chain and first-responder state machine.
#
#   ruby spec/responder_spec.rb
#
# DOM-free; focus syncing and key listeners are exercised through the Opal
# integration check.

require "minitest/autorun"
require_relative "../lib/swill/responder"

class ResponderTest < Minitest::Test
  include Swill

  # A test responder with a settable next link, controllable predicates, and
  # recorded key-event handling.
  class Node < Responder
    attr_accessor :link, :becomes, :resigns, :events
    attr_reader :became, :resigned_toward, :seen_during_become

    def initialize(becomes: true, resigns: true)
      @becomes = becomes
      @resigns = resigns
      @events = []
    end

    def next_responder = @link

    def become_first_responder
      @became = true
      @seen_during_become = Swill::FirstResponder.current
      @becomes
    end

    def resign_first_responder(next_responder = nil)
      @resigned_toward = next_responder
      @resigns
    end
  end

  def setup
    @top = Node.new
    FirstResponder.install(nil)
    FirstResponder.chain_top = @top
  end

  # --- make_first_responder --------------------------------------------------

  def test_make_sets_first_responder
    node = Node.new
    assert FirstResponder.make(node)
    assert_same node, FirstResponder.current
    assert node.first_responder?
  end

  def test_make_same_responder_is_noop
    node = Node.new
    FirstResponder.make(node)
    node.instance_variable_set(:@became, false)
    assert FirstResponder.make(node)
    refute node.became, "should not re-run become for the current FR"
  end

  def test_resign_refusal_aborts
    outgoing = Node.new(resigns: false)
    FirstResponder.make(outgoing)
    incoming = Node.new

    refute FirstResponder.make(incoming), "refused resign returns false"
    assert_same outgoing, FirstResponder.current, "FR unchanged on refusal"
    refute incoming.became, "incoming never asked to become"
  end

  def test_become_refusal_falls_to_chain_top
    refuser = Node.new(becomes: false)
    assert FirstResponder.make(refuser), "become refusal still returns true"
    assert_same @top, FirstResponder.current, "FR falls to chain top"
  end

  def test_make_nil_falls_to_chain_top
    FirstResponder.make(Node.new)
    assert FirstResponder.make(nil)
    assert_same @top, FirstResponder.current
  end

  def test_resign_is_told_the_incoming_responder
    outgoing = Node.new
    FirstResponder.make(outgoing)
    incoming = Node.new
    FirstResponder.make(incoming)
    assert_same incoming, outgoing.resigned_toward
  end

  def test_fr_is_cleared_before_become
    node = Node.new
    FirstResponder.make(node)
    assert_nil node.seen_during_become,
               "FR must be nil during become so a focus event won't re-resign"
  end

  # --- key-event routing -----------------------------------------------------

  Key = Struct.new(:key)

  class KeyNode < Node
    attr_reader :handled

    def initialize(*)
      super
      @handled = []
    end

    def cancel_operation(event) = @handled << [:cancel, event.key]
    def insert_newline(event) = @handled << [:newline, event.key]
    def complete(event) = @handled << [:complete, event.key]
  end

  def test_key_down_routes_named_keys
    node = KeyNode.new
    node.key_down(Key.new("Escape"))
    node.key_down(Key.new("Enter"))
    node.key_down(Key.new("Tab"))
    assert_equal [[:cancel, "Escape"], [:newline, "Enter"], [:complete, "Tab"]], node.handled
  end

  def test_unhandled_key_bubbles_to_next_responder
    handler = KeyNode.new
    leaf = Node.new
    leaf.link = handler
    leaf.key_down(Key.new("Escape")) # leaf has no override -> routes to cancel_operation -> bubbles
    assert_equal [[:cancel, "Escape"]], handler.handled
  end

  def test_plain_key_bubbles_via_key_down
    handler = KeyNode.new
    leaf = Node.new
    leaf.link = handler
    leaf.key_down(Key.new("a")) # not a named key: key_down bubbles up
    # handler is a Node (no key_down override beyond Responder), routes nowhere special
    assert_empty handler.handled
  end

  # --- target/action ---------------------------------------------------------

  class ActionNode < Node
    attr_reader :saved

    def save(_sender, _event) = @saved = true
  end

  def test_perform_action_walks_chain
    target = ActionNode.new
    leaf = Node.new
    leaf.link = target
    assert leaf.perform_action(:save, leaf, nil)
    assert target.saved
  end

  def test_perform_action_returns_false_when_unhandled
    refute Node.new.perform_action(:nope)
  end
end
