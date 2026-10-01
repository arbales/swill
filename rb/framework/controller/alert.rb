# typed: true
# frozen_string_literal: true

module Swill
  # An alert asks the user one question, and builds its own window rather
  # than coming from markup. `run` presents it and yields the
  # title of the button chosen:
  #
  #     alert = Swill::Alert.new
  #     alert.message_text = "Delete “Dark City”?"
  #     alert.informative_text = "This cannot be undone."
  #     alert.add_button("Cancel")
  #     alert.add_button("Delete")
  #     return unless await(alert.run) == "Delete"
  #
  # The first button takes the keyboard, so Enter chooses it. Escape chooses
  # the button titled Cancel, or yields nil when there is none. The window is
  # the framework's `alert` template: a `dialog.window.alert` holding its
  # #icon, the text in `.alert-text`, and the buttons in `.actions`.
  class Alert < Controller
    extend T::Sig

    # The question, shown as the alert's heading.
    property :message_text, type: String, default: ""

    # More about the question, shown below it. Empty shows nothing.
    property :informative_text, type: String, default: ""

    # The image beside the text, by name or URL, as Control::ImageView takes
    # it: the framework's Warning by default, or Stop for an error.
    property :icon, type: String, default: "Warning"

    # The button each title is cloned from.
    outlet :button_template, type: HTMLTemplateElement

    # Creates an alert with no text and no buttons. Set the text, add the
    # buttons, then #run it.
    sig { void }
    def initialize
      super
      @button_titles = T.let([], T::Array[String])
      @choice = T.let(nil, T.nilable(String))
    end

    # Adds a button titled +title+ after those already added. An alert with
    # none shows OK.
    sig { params(title: String).void }
    def add_button(title)
      @button_titles << title
    end

    # Presents the alert and yields the title of the button chosen, or nil
    # when Escape dismisses an alert without a Cancel button.
    sig { returns(T.nilable(String)) }
    async def run
      template = Templates.named("alert", application.root.ownerDocument)
      attach(T.must(template.content.firstElementChild).cloneNode(true))
      window = application.present_window(self, "alert")
      await window.closed
      @choice
    end

    # The action every button sends.
    sig { params(sender: Element).void }
    def choose(sender)
      finish(sender.textContent)
    end

    # Escape chooses the button titled Cancel, or dismisses the alert with
    # nil when it has none.
    sig { override.params(event: KeyboardEvent).void }
    def cancel_operation(event)
      event.preventDefault
      finish(@button_titles.include?("Cancel") ? "Cancel" : nil)
    end

    sig { params(choice: T.nilable(String)).void }
    def finish(choice) # :nodoc:
      @choice = choice
      application.dismiss(self)
    end

    # Adds a button per title, before the region's actions are connected so
    # each sends choose.
    sig { override.void }
    def view_did_load
      actions = Swell[view.element].find!(".actions")
      (@button_titles.empty? ? ["OK"] : @button_titles).each do |title|
        actions.append(Swell[view.clone_template(T.must(button_template))].text(title).element)
      end
    end
  end
end
