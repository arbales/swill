# frozen_string_literal: true

require "rack/files"

module Swill
  module Bundles
    # A Rack application serving bundles' scripts and resources from where
    # they are on disk, for an application that would rather mount them than
    # copy them into its public folder:
    #
    #     framework = Swill::Bundles::Bundle.framework(url: "/assets/ruby")
    #     r.on("assets/ruby") { r.run Swill::Bundles::Server.new(framework) }
    #
    # It answers each bundle's script and source map, and the files under
    # `resources/<name>/`, and 404 for anything else. Responses carry
    # +cache_control+.
    class Server
      def initialize(*bundles, cache_control: "public, max-age=300")
        @bundles = bundles
        @cache_control = cache_control
      end

      def call(env)
        path = Rack::Utils.unescape_path(env["PATH_INFO"].to_s).delete_prefix("/")
        file = resolve(path)
        return not_found unless file
        Rack::Files.new(File.dirname(file), {"cache-control" => @cache_control})
                   .call(env.merge("PATH_INFO" => "/#{File.basename(file)}"))
      end

    private

      # The file on disk for +path+, or nil. Only names a bundle lists are
      # served, so nothing outside its folder is reachable.
      def resolve(path)
        return nil if path.split("/").include?("..")
        @bundles.each do |bundle|
          script = File.basename(bundle.script_url)
          if [script, "#{script}.map"].include?(path)
            file = File.join(bundle.directory, path)
            return file if File.file?(file)
          end
          prefix = "resources/#{bundle.name}/"
          next unless path.start_with?(prefix)
          relative = path.delete_prefix(prefix)
          return File.join(bundle.resources_directory, relative) if bundle.manifest.paths.include?(relative)
        end
        nil
      end

      def not_found
        [404, {"content-type" => "text/plain"}, ["Not Found"]]
      end
    end
  end
end
