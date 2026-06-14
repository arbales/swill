# backtick_javascript: true

class HelloController < Swill::Controller
  property :message, default: "Swill woke up in Ruby."

  def clear(_sender, _event)
    self.message = ""
  end
end

class DemoApplication < Swill::Application
  def application_did_finish_launching
    `document.querySelector("[autofocus]")?.focus()`
  end
end

DemoApplication.shared.start
