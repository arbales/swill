"use strict";
(() => {
  // build/framework.external.mjs
  var framework = globalThis.Swill;
  if (!framework) throw new Error("Load swill.js before app.js");
  var Runtime = framework.Runtime;
  var Swill__Observable = framework.Swill__Observable;
  var Swill__Object = framework.Swill__Object;
  var Swill__Ownership = framework.Swill__Ownership;
  var Swill__ObjectBindings = framework.Swill__ObjectBindings;
  var Swill__Responder = framework.Swill__Responder;
  var Swill__View = framework.Swill__View;
  var Swill__Controller = framework.Swill__Controller;
  var Swill__Bindings = framework.Swill__Bindings;
  var Swill__Actions = framework.Swill__Actions;
  var Swill__Outlets = framework.Swill__Outlets;
  var Swill__Awakening = framework.Swill__Awakening;
  var Swill__Fragments = framework.Swill__Fragments;
  var Swill__Window = framework.Swill__Window;
  var Swill__Application = framework.Swill__Application;
  var Swill__Launcher = framework.Swill__Launcher;
  var Swill__Model__Attributes = framework.Swill__Model__Attributes;
  var Swill__Model__Attributes_ClassMethods = framework.Swill__Model__Attributes_ClassMethods;
  var Swill__Model__DirtyTracking = framework.Swill__Model__DirtyTracking;
  var Swill__Model__Drafts = framework.Swill__Model__Drafts;
  var Swill__Model__Base = framework.Swill__Model__Base;

  // build/application.classes.mjs
  function NormalizeName(Superclass) {
    class NormalizeName_Layer extends Superclass {
      normalize(value) {
        return value;
      }
    }
    return NormalizeName_Layer;
  }
  function StripName(Superclass) {
    class StripName_Layer extends Superclass {
      normalize(value) {
        return Runtime.strip(super.normalize(value));
      }
    }
    return StripName_Layer;
  }
  function DecorateName(Superclass) {
    class DecorateName_Layer extends Superclass {
      normalize(value) {
        return `<${super.normalize(value)}>`;
      }
    }
    return DecorateName_Layer;
  }
  var Demo__Person = class extends Swill__Model__Base {
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
      return value != null ? 1 : 2;
    }
    ruby_or(value) {
      return value != null ? value : "fallback";
    }
  };
  var Demo__SpecialPerson = class extends Demo__Person {
    // The validate_<attribute>(value, previous) convention: return the value
    // to store, or raise to reject and keep the previous one.
    validate_role(value, previous) {
      let cleaned = Runtime.strip(value);
      if (Runtime.isEmpty(cleaned)) throw new Error("role must not be blank");
      return cleaned;
    }
  };
  function NameTracking(Superclass) {
    class NameTracking_Layer extends Superclass {
      property_will_change(name, previous, value) {
        super.property_will_change(name, previous, value);
        if (name === "name") {
          if (this.baseline == null) this.baseline = previous;
          return this.dirty = value !== this.baseline;
        }
      }
    }
    return NameTracking_Layer;
  }
  function NameValidation(Superclass) {
    class NameValidation_Layer extends Superclass {
      coerce_property_value(name, value, previous) {
        value = super.coerce_property_value(name, value, previous);
        if (name === "name") {
          value = Runtime.read(value, "strip");
          if (value === "") throw new Error("name must not be blank");
        }
        ;
        return value;
      }
    }
    return NameValidation_Layer;
  }
  var ConcernRecord = class extends Swill__Object {
  };
  var SpecializedRecord = class extends ConcernRecord {
  };
  var OtherConcernRecord = class extends Swill__Object {
  };
  var Demo__Controller = class extends Swill__Controller {
    // Connected between view_did_load and awake_from_dom. The input becomes a
    // plain View, the nested controller is itself the value, the JSON script
    // is decoded, and an optional outlet may be absent.
    // Kept equal to the badge outlet's count by an object binding.
    view_did_load() {
      return this.reset_person();
    }
    awake_from_dom() {
      let current = this.person;
      let data = this.seed;
      if (Runtime.isTruthy(current && data)) current.name = data.name;
      let current_badge = this.badge;
      if (current_badge) {
        this.bind("badge_count", { to: current_badge, key_path: "count" });
      }
      ;
      let app = this.application();
      let field = this.name_field;
      if (Runtime.isTruthy(app && field)) return app.make_first_responder(field);
    }
    // Escape in any owned field bubbles here through the responder chain.
    cancel_operation(event) {
      return this.clear();
    }
    clear() {
      this.reset_person();
      return this.title;
    }
    reset_person() {
      return this.person = new Demo__Person();
    }
    // Reached through the responder chain from a nested controller's button.
    shout() {
      let current = this.person;
      if (current) return current.name = Runtime.upcase(current.name);
    }
  };
  var Demo__Badge = class extends Swill__Controller {
    // When this badge is window content, its count lives in the URL fragment
    // under the window's name (main.n=3) and comes back on Back/Forward.
    controller_did_restore(restored) {
      return this.restored = restored;
    }
    bump() {
      return this.count = this.count + 1;
    }
    clear() {
      return this.count = 0;
    }
    // A badge presented as a dialog closes itself through the application.
    close() {
      let app = this.application();
      if (app) return app.dismiss(this);
    }
  };
  var Demo__Application = class extends Swill__Application {
    application_did_launch() {
      return this.launched = true;
    }
    // Alternate the main window between two templates.
    swap_window() {
      let current = this.window_named("main");
      let name = Runtime.isTruthy(current && current.content_name() === "welcome") ? "farewell" : "welcome";
      return this.load_window_content("main", name);
    }
    open_palette() {
      return this.show_window("palette");
    }
    // Clears every awakened controller that handles clear; the metadata
    // query is the explicit stand-in for respond_to?.
    reset() {
      return this.controllers().forEach((controller) => {
        if (Runtime.isTruthy(Runtime.respondsTo(controller, "clear"))) {
          controller.clear();
        }
      });
    }
  };
  var Demo__PersonEditor = class extends Swill__Controller {
    // Controller-local state, reached from markup with bind="@note".
    binding_root() {
      return "represented_object";
    }
  };

  // build/application.meta.mjs
  var meta = {
    mixins: {
      "NormalizeName": {
        factory: NormalizeName,
        methods: {
          "normalize": {
            "arity": 1
          }
        }
      },
      "StripName": {
        factory: StripName,
        methods: {
          "normalize": {
            "arity": 1
          }
        }
      },
      "DecorateName": {
        factory: DecorateName,
        methods: {
          "normalize": {
            "arity": 1
          }
        }
      },
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
        mixins: [NormalizeName, StripName, DecorateName],
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
            compute: function compute_label() {
              return this.loud ? Runtime.upcase(this.name) : this.name;
            }
          },
          "blank?": {
            js: "blank_predicate",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_blank_predicate() {
              return Runtime.isBlank(this.name);
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
        methods: {
          "validate_role": {
            "arity": 2
          }
        }
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
          "name_field": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue: function default_name_field() {
              return null;
            }
          },
          "badge": {
            type: "T.nilable(Demo::Badge)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue: function default_badge() {
              return null;
            }
          },
          "seed": {
            type: "T.untyped",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue: function default_seed() {
              return null;
            }
          },
          "missing": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue: function default_missing() {
              return null;
            }
          },
          "badge_count": {
            type: "Integer",
            attribute: false,
            defaultValue: function default_badge_count() {
              return 0;
            }
          },
          "title": {
            type: "String",
            attribute: false,
            compute: function compute_title() {
              let current = this.person;
              return current ? current.greeting() : this.fallback;
            }
          }
        },
        methods: {
          "view_did_load": {
            "arity": 0
          },
          "awake_from_dom": {
            "arity": 0
          },
          "cancel_operation": {
            "arity": 1
          },
          "clear": {
            "arity": 0
          },
          "reset_person": {
            "arity": 0
          },
          "shout": {
            "arity": 0
          }
        }
      },
      "Demo::Badge": {
        constructor: Demo__Badge,
        properties: {
          "count": {
            type: "Integer",
            attribute: false,
            defaultValue: function default_count() {
              return 0;
            }
          },
          "restored": {
            type: "T::Boolean",
            attribute: false,
            defaultValue: function default_restored() {
              return false;
            }
          },
          "title": {
            type: "String",
            attribute: false,
            compute: function compute_title2() {
              return `Badge ${this.count}`;
            }
          }
        },
        restorations: [{ path: "count", key: "n", type: "Integer" }],
        methods: {
          "controller_did_restore": {
            "arity": 1
          },
          "bump": {
            "arity": 0
          },
          "clear": {
            "arity": 0
          },
          "close": {
            "arity": 0
          }
        }
      },
      "Demo::Application": {
        constructor: Demo__Application,
        properties: {
          "launched": {
            type: "T::Boolean",
            attribute: false,
            defaultValue: function default_launched() {
              return false;
            }
          }
        },
        methods: {
          "application_did_launch": {
            "arity": 0
          },
          "swap_window": {
            "arity": 0
          },
          "open_palette": {
            "arity": 0
          },
          "reset": {
            "arity": 0
          }
        }
      },
      "Demo::PersonEditor": {
        constructor: Demo__PersonEditor,
        properties: {
          "note": {
            type: "String",
            attribute: false,
            defaultValue: function default_note() {
              return "";
            }
          }
        },
        methods: {
          "binding_root": {
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
