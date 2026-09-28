# frozen_string_literal: true

require "fileutils"

module Swill
  module Distant
    # Writes the reviewable client schema, proxy Ruby, and RBI from one
    # schema, and once per model an extension file the application owns.
    class Generator
      attr_reader :entry, :root

      def initialize(entry, root: Dir.pwd)
        @entry = File.expand_path(entry)
        @root = File.expand_path(root)
      end

      def schema
        return @schema if @schema
        raise ArgumentError, "no server entry: #{entry}" unless File.file?(entry)

        require entry
        @schema = Schema.discover
      end

      # Extensions are written only when absent: the application edits them.
      def generate
        outputs = rendered_outputs
        (artifact_paths - outputs.keys).each { |path| FileUtils.rm_f(path) }
        outputs.each do |path, source|
          FileUtils.mkdir_p(File.dirname(path))
          File.write(path, source)
        end
        extensions = extension_outputs.reject { |path, _| File.file?(path) }
        extensions.each do |path, source|
          FileUtils.mkdir_p(File.dirname(path))
          File.write(path, source)
        end
        outputs.keys + extension_outputs.keys
      end

      # Only the generated roots are checked; extensions belong to the
      # application once written.
      def check
        outputs = rendered_outputs
        extra = artifact_paths - outputs.keys
        raise ArgumentError, "obsolete generated data file: #{extra.first}" unless extra.empty?

        outputs.each do |path, source|
          raise ArgumentError, "generated data file is missing: #{path}" unless File.file?(path)
          raise ArgumentError, "generated data file is stale: #{path}" unless File.read(path) == source
        end
        true
      end

      private

      # Every file under the two generated roots. Obsolete-file deletion is
      # restricted to these roots, so extensions are never removed.
      def artifact_paths
        roots = [
          File.join(root, "client", "models", "generated"),
          File.join(root, "sorbet", "rbi", "shims", "generated")
        ]
        roots.flat_map { |directory| Dir.glob(File.join(directory, "**", "*")).select { |path| File.file?(path) } }
      end

      def rendered_outputs
        generated = File.join(root, "client", "models", "generated")
        rbi = File.join(root, "sorbet", "rbi", "shims", "generated")
        outputs = {
          File.join(generated, "schema.json") => "#{JSON.pretty_generate(schema.to_h)}\n",
          File.join(generated, "schema.rb") => schema_source
        }
        schema.values.each_value do |value|
          basename = underscore(value.fetch("name"))
          outputs[File.join(generated, "#{basename}.rb")] = value_source(value)
          outputs[File.join(rbi, "#{basename}.rbi")] = value_rbi_source(value)
        end
        schema.models.each_value do |model|
          basename = underscore(model.fetch("name"))
          outputs[File.join(generated, "#{basename}.rb")] = proxy_source(model)
          outputs[File.join(rbi, "#{basename}.rbi")] = rbi_source(model)
        end
        outputs
      end

      # One extension per model, beside the generated directory. Values get
      # none: they are plain, complete objects.
      def extension_outputs
        schema.models.each_value.to_h do |model|
          basename = underscore(model.fetch("name"))
          [File.join(root, "client", "models", "#{basename}.rb"), render_extension(model.fetch("name"))]
        end
      end

      def render_extension(name)
        parts = name.split("::")
        namespace = parts[0...-1]
        lines = namespace.each_with_index.map { |part, index| "#{'  ' * index}module #{part}" }
        depth = namespace.length
        lines << "#{'  ' * depth}# Client behavior for #{name}, beside its generated proxy."
        lines << "#{'  ' * depth}class #{parts.last}"
        lines << "#{'  ' * depth}end"
        namespace.length.times.reverse_each { |index| lines << "#{'  ' * index}end" }
        (["# typed: true", "# frozen_string_literal: true", ""] + lines).join("\n") + "\n"
      end

      def proxy_source(model)
        body = ["model_name #{model['name'].to_json}"]
        model.fetch("fields").each_value do |field|
          next if field["name"] == "id"

          body << "attribute :#{field['name']}, type: #{ruby_type(field['type'])}"
        end
        model.fetch("associations").each_value do |association|
          macro = association.fetch("association")
          body << "#{macro} :#{association['name']}, class: #{association['model'].to_json}"
        end
        model.fetch("remote_methods").each_value do |operation|
          body << ""
          body.concat(proxy_operation(operation))
        end
        ["# typed: true", "# frozen_string_literal: true", "", render_class(model["name"], body), ""].join("\n")
      end

      def proxy_operation(operation)
        parameters = operation.fetch("parameters")
        signature = operation.fetch("parameters").map do |item|
          "#{item['name']}: #{ruby_type(item['type'])}"
        end.join(", ")
        sig_params = signature.empty? ? "" : "params(#{signature})."
        client_method = { "query" => "query", "resolver" => "resolve", "command" => "command" }
                        .fetch(operation["kind"])
        instance_command = operation["kind"] == "command" && operation.fetch("target", "instance") == "instance"
        prefix = instance_command ? "" : "self."
        target = instance_command ? "self" : "data_model_name"
        client_method = "class_command" if operation["kind"] == "command" && !instance_command
        declaration = parameters.map { |item| parameter_declaration(item) }.join(", ")
        positional = parameters.select { |item| %w[req opt rest].include?(item["kind"]) }
        args = positional.map { |item| item["kind"] == "rest" ? "*#{item['name']}" : item["name"] }.join(", ")
        keyed = parameters.select { |item| %w[keyreq key keyrest].include?(item["kind"]) }
        keywords = keyed.map do |item|
          item["kind"] == "keyrest" ? "**#{item['name']}" : "#{item['name']}: #{item['name']}"
        end.join(", ")
        [
          "sig { #{sig_params}returns(#{ruby_type(operation['returns'])}) }",
          "async def #{prefix}#{operation['name']}(#{declaration})",
          "  await Swill::Distant::Client.default.#{client_method}(#{target}, #{operation['name'].to_json}, [#{args}], {#{keywords}}, #{operation.dig('returns', 'kind').to_json})",
          "end"
        ]
      end

      def rbi_source(model)
        body = []
        model.fetch("fields").each_value do |field|
          next if field["name"] == "id"

          type = ruby_type(field["type"])
          body.push("sig { returns(#{type}) }", "def #{field['name']}; end")
        end
        model.fetch("associations").each_value do |association|
          target = association.fetch("model")
          type = if association["kind"] == "many"
                   "Swill::Model::AssociationCollection[#{target}]"
                 else
                   "T.nilable(#{target})"
                 end
          body.push("sig { returns(#{type}) }", "def #{association['name']}; end")
          if association["kind"] == "many"
            body.push("sig { returns(Swill::ArrayController) }", "def #{association['name']}_controller; end")
          end
        end
        model.fetch("remote_methods").each_value do |operation|
          parameters = operation["parameters"].map { |item| "#{item['name']}: #{ruby_type(item['type'])}" }.join(", ")
          sig_params = parameters.empty? ? "" : "params(#{parameters})."
          instance_command = operation["kind"] == "command" && operation.fetch("target", "instance") == "instance"
          prefix = instance_command ? "" : "self."
          arguments = operation["parameters"].map { |item| rbi_parameter_declaration(item) }.join(", ")
          body.push(
            "sig { #{sig_params}returns(#{ruby_type(operation['returns'])}) }",
            "def #{prefix}#{operation['name']}(#{arguments}); end"
          )
        end
        ["# typed: true", "", render_class(model["name"], body), ""].join("\n")
      end

      def schema_source
        namespaces = schema.models.keys.map { |name| name.split("::")[0...-1] }
        common = namespaces.reduce do |left, right|
          left.take_while.with_index { |part, index| right[index] == part }
        end || []
        lines = ["# frozen_string_literal: true", ""]
        common.each_with_index { |name, index| lines << "#{'  ' * index}module #{name}" }
        depth = common.length
        lines << "#{'  ' * depth}module DataSchema"
        lines << "#{'  ' * (depth + 1)}HASH = #{schema.hash.to_json}"
        lines << "#{'  ' * depth}end"
        common.length.times.reverse_each { |index| lines << "#{'  ' * index}end" }
        "#{lines.join("\n")}\n"
      end

      def value_source(value)
        body = value.fetch("fields").values.map do |field|
          "property :#{field['name']}, type: #{ruby_type(field['type'])}, default: nil"
        end
        ["# typed: true", "# frozen_string_literal: true", "", render_value_class(value["name"], body), ""].join("\n")
      end

      def value_rbi_source(value)
        body = value.fetch("fields").values.flat_map do |field|
          ["sig { returns(#{ruby_type(field['type'])}) }", "def #{field['name']}; end"]
        end
        ["# typed: true", "", render_value_class(value["name"], body), ""].join("\n")
      end

      def render_value_class(name, body)
        parts = name.split("::")
        namespace = parts[0...-1]
        lines = namespace.each_with_index.map { |part, index| "#{'  ' * index}module #{part}" }
        depth = namespace.length
        lines << "#{'  ' * depth}class #{parts.last} < Swill::Object"
        lines.concat(body.map { |line| "#{'  ' * (depth + 1)}#{line}" })
        lines << "#{'  ' * depth}end"
        namespace.length.times.reverse_each { |index| lines << "#{'  ' * index}end" }
        lines.join("\n")
      end

      def render_class(name, body)
        parts = name.split("::")
        namespace = parts[0...-1]
        lines = namespace.each_with_index.map { |part, index| "#{'  ' * index}module #{part}" }
        depth = namespace.length
        lines << "#{'  ' * depth}class #{parts.last} < Swill::Distant::Object"
        lines.concat(body.map { |line| line.empty? ? "" : "#{'  ' * (depth + 1)}#{line}" })
        lines << "#{'  ' * depth}end"
        namespace.length.times.reverse_each { |index| lines << "#{'  ' * index}end" }
        lines.join("\n")
      end

      def ruby_type(type)
        members = type.fetch("members", [])
        case type.fetch("kind")
        when "primitive"
          type.fetch("name") == "Boolean" ? "T::Boolean" : type.fetch("name")
        when "model", "value" then type.fetch("name")
        when "enum" then "String"
        when "optional" then "T.nilable(#{ruby_type(members.fetch(0))})"
        when "array" then "T::Array[#{ruby_type(members.fetch(0))}]"
        when "result_set" then "Swill::Model::ResultSet[#{ruby_type(members.fetch(0))}]"
        else "T.untyped"
        end
      end

      def parameter_declaration(parameter)
        name = parameter["name"]
        case parameter["kind"]
        when "req" then name
        when "opt" then "#{name} = Swill::Runtime.omitted_argument"
        when "rest" then "*#{name}"
        when "keyreq" then "#{name}:"
        when "key" then "#{name}: Swill::Runtime.omitted_argument"
        when "keyrest" then "**#{name}"
        end
      end

      def rbi_parameter_declaration(parameter)
        name = parameter["name"]
        case parameter["kind"]
        when "req" then name
        when "opt" then "#{name} = Swill::Runtime.omitted_argument"
        when "rest" then "*#{name}"
        when "keyreq" then "#{name}:"
        when "key" then "#{name}: Swill::Runtime.omitted_argument"
        when "keyrest" then "**#{name}"
        end
      end

      def underscore(name)
        name.gsub("::", "/").gsub(/([a-z\d])([A-Z])/, '\\1_\\2').downcase
      end
    end
  end
end
