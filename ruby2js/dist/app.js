"use strict";
(() => {
  // build/framework.external.mjs
  var framework = globalThis.Swill;
  if (!framework) throw new Error("Load swill.js before app.js");
  var Runtime = framework.Runtime;
  var ReactiveObject = framework.ReactiveObject;
  var Swill__Model__Attributes = framework.Swill__Model__Attributes;
  var Swill__Model__Attributes_ClassMethods = framework.Swill__Model__Attributes_ClassMethods;
  var StripName = framework.StripName;
  var DecorateName = framework.DecorateName;
  var Record = framework.Record;

  // build/application.classes.mjs
  var $T = (v) => v !== false && v != null;
  var $ror = (a, b) => $T(a) ? a : b();
  var Demo__Person = class extends Record {
    normalize(value) {
      return `[${super.normalize(value)}]`;
    }
    greeting() {
      return `Hello ${this.label}`;
    }
    rename(value) {
      return this.name = this.normalize(value);
    }
    ruby_truth(value) {
      return $T(value) ? 1 : 2;
    }
    ruby_or(value) {
      return $ror(value, () => "fallback");
    }
  };
  var Demo__SpecialPerson = class extends Demo__Person {
  };
  function NameTracking(Superclass) {
    let $T2 = (v) => v !== false && v != null;
    class NameTracking_Layer extends Superclass {
      property_will_change(name, previous, value) {
        super.property_will_change(name, previous, value);
        if ($T2(Runtime.equal(name, "name"))) {
          if ($T2(Runtime.equal(this.baseline, null))) this.baseline = previous;
          return this.dirty = !Runtime.equal(value, this.baseline);
        }
      }
    }
    return NameTracking_Layer;
  }
  function NameValidation(Superclass) {
    let $T2 = (v) => v !== false && v != null;
    class NameValidation_Layer extends Superclass {
      coerce_property_value(name, value, previous) {
        value = super.coerce_property_value(name, value, previous);
        if ($T2(Runtime.equal(name, "name"))) {
          value = Runtime.valueRead(value, "strip");
          if ($T2(Runtime.equal(value, ""))) throw "name must not be blank";
        }
        ;
        return value;
      }
    }
    return NameValidation_Layer;
  }
  var ConcernRecord = class extends ReactiveObject {
  };
  var SpecializedRecord = class extends ConcernRecord {
  };
  var OtherConcernRecord = class extends ReactiveObject {
  };
  var Demo__Controller = class extends Record {
    clear() {
      this.person = null;
      return this.title;
    }
  };

  // build/application.meta.mjs
  var meta = {
    mixins: {
      "NameTracking": {
        factory: NameTracking,
        methods: {
          "property_will_change": {
            "arity": 3
          }
        }
      },
      "NameValidation": {
        factory: NameValidation,
        methods: {
          "coerce_property_value": {
            "arity": 3
          }
        }
      }
    },
    classes: {
      "Demo::Person": {
        constructor: Demo__Person,
        mixins: [StripName, DecorateName],
        properties: {
          "name": {
            type: "String",
            attribute: true,
            key: "name",
            defaultValue: function default_name() {
              return "";
            }
          },
          "loud": {
            type: "T::Boolean",
            attribute: false,
            defaultValue: function default_loud() {
              return false;
            }
          },
          "label": {
            type: "String",
            attribute: false,
            compute: /* @__PURE__ */ (() => {
              let $T2 = (v) => v !== false && v != null;
              function compute_label() {
                return $T2(this.loud) ? Runtime.valueRead(this.name, "upcase") : this.name;
              }
              return compute_label;
            })()
          },
          "blank?": {
            js: "blank_predicate",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_blank_predicate() {
              return Runtime.valueRead(this.name, "blank?");
            }
          }
        },
        registries: { model_attributes: {
          "name": { property: "name", key: "name" }
        } },
        methods: {
          "normalize": {
            "arity": 1
          },
          "greeting": {
            "arity": 0
          },
          "rename": {
            "arity": 1
          },
          "ruby_truth": {
            "arity": 1
          },
          "ruby_or": {
            "arity": 1
          }
        }
      },
      "Demo::SpecialPerson": {
        constructor: Demo__SpecialPerson,
        properties: {
          "role": {
            type: "String",
            attribute: true,
            key: "job",
            defaultValue: function default_role() {
              return "editor";
            }
          }
        },
        registries: { model_attributes: {
          "role": { property: "role", key: "job" }
        } },
        methods: {}
      },
      "ConcernRecord": {
        constructor: ConcernRecord,
        mixins: [NameTracking, NameValidation],
        properties: {
          "name": {
            type: "String",
            attribute: true,
            key: "name",
            defaultValue: function default_name2() {
              return "Ada";
            }
          },
          "baseline": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue: function default_baseline() {
              return null;
            }
          },
          "dirty": {
            type: "T::Boolean",
            attribute: false,
            defaultValue: function default_dirty() {
              return false;
            }
          }
        },
        methods: {}
      },
      "SpecializedRecord": {
        constructor: SpecializedRecord,
        properties: {
          "name": {
            type: "String",
            attribute: true,
            key: "name",
            defaultValue: function default_name3() {
              return "Grace";
            }
          }
        },
        methods: {}
      },
      "OtherConcernRecord": {
        constructor: OtherConcernRecord,
        mixins: [NameTracking, NameValidation],
        properties: {
          "name": {
            type: "String",
            attribute: true,
            key: "name",
            defaultValue: function default_name4() {
              return "Ada";
            }
          },
          "baseline": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue: function default_baseline2() {
              return null;
            }
          },
          "dirty": {
            type: "T::Boolean",
            attribute: false,
            defaultValue: function default_dirty2() {
              return false;
            }
          }
        },
        methods: {}
      },
      "Demo::Controller": {
        constructor: Demo__Controller,
        properties: {
          "person": {
            type: "T.nilable(Demo::Person)",
            attribute: false,
            defaultValue: function default_person() {
              return null;
            }
          },
          "fallback": {
            type: "String",
            attribute: false,
            defaultValue: function default_fallback() {
              return "Nobody";
            }
          },
          "title": {
            type: "String",
            attribute: false,
            compute: /* @__PURE__ */ (() => {
              let $T2 = (v) => v !== false && v != null;
              function compute_title() {
                let current = this.person;
                return $T2(current) ? current.greeting() : this.fallback;
              }
              return compute_title;
            })()
          }
        },
        methods: {
          "clear": {
            "arity": 0
          }
        }
      }
    }
  };

  // build/application.mjs
  Runtime.install(meta);
})();
//# sourceMappingURL=app.js.map
