# typed: false
# Only a semantic oracle for explicitly shared code. This is not a second port:
# reuse the working Opal implementation's DOM-free observation on MRI.
require "sorbet-runtime"
require_relative "../../opal/lib/swill/core/support"
require_relative "../../opal/lib/swill/core/core_ext"
require_relative "../../opal/lib/swill/core/observable"

class ReactiveObject
  include Swill::Observable

  def self.property(name, type:, default: nil, &block)
    block ? super(name, &block) : super(name, default: default)
  end

  def self.attribute(name, type:, default:, key: name)
    property(name, type: type, default: default)
  end
end
