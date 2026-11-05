# typed: true
# frozen_string_literal: true

module SourceMapFixture
  class First
    def marker
      value = "first_token"
      value
    end
  end

  class Second
    def marker
      value = "second_token"
      value
    end

    def explode
      raise "source_map_probe"
    end
  end
end
