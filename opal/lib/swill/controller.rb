# backtick_javascript: true

module Swill
  class Controller < Responder
    class << self
      def property(name, default: nil)
        define_method(name) do
          unless @properties.key?(name)
            @properties[name] = default.respond_to?(:call) ? instance_exec(&default) : default
          end
          @properties[name]
        end

        define_method("#{name}=") do |value|
          previous = public_send(name)
          return value if previous == value

          @properties[name] = value
          notify_change(name, previous, value)
          value
        end
      end
    end

    attr_reader :view
    attr_accessor :parent

    def initialize
      @properties = {}
      @observers = Hash.new { |hash, key| hash[key] = [] }
      @parent = nil
    end

    def attach(element)
      @view = View.for(element) || View.new(element)
      @view.controller = self
      `#{element}.__swill_controller__ = #{self}`
      self
    end

    def next_responder
      parent || Application.shared
    end

    def observe(name, &observer)
      @observers[name.to_sym] << observer
      -> { @observers[name.to_sym].delete(observer) }
    end

    def notify_change(name, previous, value)
      callback = "#{name}_did_change"
      public_send(callback, previous, value) if respond_to?(callback)
      @observers[name.to_sym].dup.each { |observer| observer.call(value) }
    end

    def view_did_load; end
    def awake_from_dom; end
    def controller_did_load; end
    def view_will_appear; end
    def view_did_appear; end
  end
end
