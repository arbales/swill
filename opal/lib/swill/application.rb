# backtick_javascript: true

module Swill
  class Application < Responder
    class << self
      attr_writer :shared

      def shared
        @shared ||= new
      end
    end

    def start(root = `document.body`)
      self.class.shared = self
      @root = root
      Awakening.wire(root)
      watch(root)
      application_did_finish_launching
      self
    end

    def next_responder
      nil
    end

    def application_did_finish_launching; end

    private

    def watch(root)
      callback = lambda do |mutations, _observer|
        mutations.each do |mutation|
          `Array.from(#{mutation}.addedNodes)`.each do |node|
            Awakening.wire(node) if `#{node}.nodeType === 1`
          end
        end
      end

      @observer = `new MutationObserver(#{callback})`
      `#{@observer}.observe(#{root}, { childList: true, subtree: true })`
    end
  end
end
