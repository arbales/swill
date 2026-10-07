# frozen_string_literal: true

require "json"
require "timeout"

module Swill
  module Distant
    # How long schema-only mode waits for the database before going without.
    DATABASE_TIMEOUT = 5

    # Whether this process only describes the schema, as `swill data
    # generate` runs the server entry with `SWILL_SCHEMA_ONLY` set: an
    # application skips what it needs only to serve, such as API clients.
    def self.schema_only?
      ENV.key?("SWILL_SCHEMA_ONLY")
    end

    # The application's database, connected by the block:
    #
    #     DB = Swill::Distant.database { Sequel.connect(ENV.fetch("DATABASE_URL")) }
    #
    # In schema-only mode a database out of reach is not an error: within
    # DATABASE_TIMEOUT seconds the block either connects or Swill answers a
    # mock instead, and the generator reads the models' columns from the
    # last schema it generated. No columns are listed by hand.
    def self.database(&connect)
      return connect.call unless schema_only?
      begin
        Timeout.timeout(DATABASE_TIMEOUT) { connect.call.tap(&:test_connection) }
      rescue StandardError, LoadError => error
        require "sequel"
        @offline_reason = error.message.lines.first.to_s.strip
        Sequel.mock
      end
    end

    # Whether `database` went without the database, and why.
    def self.offline?
      !@offline_reason.nil?
    end

    def self.offline_reason
      @offline_reason
    end

    # The schema.json the generator last wrote, which a schema built without
    # the database reads its models' columns from. The generator sets it.
    class << self
      attr_accessor :generated_schema
    end

    # The previous schema payload when the database is out of reach, or nil
    # with the database. Raises when there is no previous one: the first
    # generation needs the database.
    def self.previous_schema
      return nil unless offline?
      path = generated_schema
      unless path && File.file?(path)
        raise ArgumentError, "the database is out of reach (#{offline_reason}) and there is no previously " \
                             "generated schema to read the columns from; generate once with the database"
      end
      @previous_schema ||= JSON.parse(File.read(path))
    end
  end
end
