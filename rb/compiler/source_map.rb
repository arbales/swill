# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Concatenates JavaScript and its version-3 source maps. Generated wrappers
    # have no map. Ruby extracts carry a row-origin table, so maps resolve to
    # whole original files even when one class folds several reopened bodies.
    class SourceMap
      BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".freeze

      def initialize
        @javascript = +""
        @rows = []
        @sources = []
        @contents = []
        @names = []
      end

      def to_s
        @javascript
      end

      # Each extract row's original buffer, zero-based line, and column offset.
      # Only the first row loses its indentation when copied from an AST range.
      def self.origins(range)
        range.source.lines.each_index.map do |row|
          [range.source_buffer, range.line - 1 + row, row.zero? ? range.column : 0]
        end
      end

      def append(javascript, map: nil, origins: nil)
        return self if javascript.empty?
        offset = @javascript.count("\n")
        if map
          map = map.transform_keys(&:to_s)
          lines = javascript.lines
          buffers = {}
          self.class.decode(map.fetch("mappings")).each_with_index do |segments, row|
            @rows[offset + row] = segments.map do |segment|
              column = origins ? utf16_column(lines.fetch(row, ""), segment[0]) : segment[0]
              next [column] if segment.length == 1
              if origins
                origin = origins[segment[2]]
                next [column] unless origin
                buffer, original_row, adjustment = origin
                source, content, original_lines = buffers[buffer] ||= [
                  File.expand_path(buffer.name), buffer.source, buffer.source.lines
                ]
                # Ruby2JS's Prism locations are byte offsets; source maps use
                # UTF-16 columns. Parser's buffers use character offsets.
                original_line = original_lines[original_row] || ""
                original_column = segment[3] + adjustment
                prefix = if buffer.is_a?(::Ruby2JS::PrismSourceBuffer)
                  original_line.byteslice(0, original_column)
                else
                  original_line[0, original_column]
                end
                original_column = prefix.encode("UTF-16LE").bytesize / 2
              else
                source = map.fetch("sources").fetch(segment[1])
                content = map["sourcesContent"]&.[](segment[1])
                original_row, original_column = segment.values_at(2, 3)
              end
              index = @sources.index(source)
              unless index
                index = @sources.length
                @sources << source
                @contents << content
              end
              translated = [column, index, original_row, original_column]
              if segment.length == 5
                name = map.fetch("names").fetch(segment[4])
                name_index = @names.index(name)
                unless name_index
                  name_index = @names.length
                  @names << name
                end
                translated << name_index
              end
              translated
            end
          end
        end
        @javascript << javascript
        @javascript << "\n" unless javascript.end_with?("\n")
        @rows.fill([], @rows.length...@javascript.count("\n"))
        self
      end

      def to_h(file:)
        {
          "version" => 3, "file" => file, "sources" => @sources,
          "sourcesContent" => @contents, "names" => @names,
          "mappings" => self.class.encode(@rows)
        }
      end

      # Absolute segments: generated column, then optional source index,
      # original line, original column, and optional name index. Only the
      # generated-column delta resets at a row boundary.
      def self.decode(mappings)
        previous = [0, 0, 0, 0, 0]
        mappings.split(";", -1).map do |line|
          previous[0] = 0
          next [] if line.empty?
          line.split(",").map do |segment|
            values = []
            value = shift = 0
            segment.each_char do |character|
              digit = BASE64.index(character)
              raise ArgumentError, "invalid source-map VLQ" unless digit
              value |= (digit & 31) << shift
              if digit & 32 == 0
                values << (value.odd? ? -(value >> 1) : value >> 1)
                value = shift = 0
              else
                shift += 5
              end
            end
            unless shift.zero? && [1, 4, 5].include?(values.length)
              raise ArgumentError, "invalid source-map segment"
            end
            values.each_with_index.map { |delta, index| previous[index] += delta }
          end
        end
      end

      def self.encode(rows)
        previous = [0, 0, 0, 0, 0]
        rows.map do |segments|
          previous[0] = 0
          segments.map do |segment|
            segment.each_with_index.map do |value, index|
              delta = value - previous[index]
              previous[index] = value
              vlq = (delta.abs << 1) | (delta.negative? ? 1 : 0)
              encoded = +""
              loop do
                digit = vlq & 31
                vlq >>= 5
                encoded << BASE64[digit | (vlq.positive? ? 32 : 0)]
                break if vlq.zero?
              end
              encoded
            end.join
          end.join(",")
        end.join(";")
      end

      private

      # Ruby2JS's serializer counts Ruby characters in generated JavaScript.
      def utf16_column(line, column)
        line[0, column].encode("UTF-16LE").bytesize / 2
      end
    end
  end
end
