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
  var Swill__Controller__List = framework.Swill__Controller__List;
  var Swill__Controller__SortableList = framework.Swill__Controller__SortableList;
  var Swill__Controller__Editor = framework.Swill__Controller__Editor;
  var Swill__Controller__InlineEditor = framework.Swill__Controller__InlineEditor;
  var Swill__RowEdit = framework.Swill__RowEdit;
  var Swill__Controller__EditableList = framework.Swill__Controller__EditableList;
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
    rubyTruth(value) {
      return value != null ? 1 : 2;
    }
    rubyOr(value) {
      return value != null ? value : "fallback";
    }
  };
  var Demo__SpecialPerson = class extends Demo__Person {
    // The validate_<attribute>(value, previous) convention: return the value
    // to store, or raise to reject and keep the previous one.
    validateRole(value, previous) {
      let cleaned = Runtime.strip(value);
      if (Runtime.isEmpty(cleaned)) throw new Error("role must not be blank");
      return cleaned;
    }
  };
  function NameTracking(Superclass) {
    class NameTracking_Layer extends Superclass {
      propertyWillChange(name, previous, value) {
        super.propertyWillChange(name, previous, value);
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
      coercePropertyValue(name, value, previous) {
        value = super.coercePropertyValue(name, value, previous);
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
    // The roster JSON becomes people; the list shows them through bind="people".
    viewDidLoad() {
      return this.resetPerson();
    }
    awakeFromDOM() {
      Runtime.must(this.person).name = Runtime.fetch(
        Runtime.must(this.seed),
        "name"
      );
      this.bind(
        "badge_count",
        { to: Runtime.must(this.badge), key_path: "count" }
      );
      if (this.roster) this.people = Runtime.must(this.roster);
      return this.application().makeFirstResponder(Runtime.must(this.nameField));
    }
    // Start with the name field focused; the field is a View, so it accepts.
    // A plain list hands its selection here on Enter or a double-click; the
    // people list edits in place instead and never sends this.
    activateSelection(sender) {
      return this.person = sender.selectedObject;
    }
    // A row's remove button. The sender is the button, so the list says which
    // row it sits in; the list re-renders from the new array.
    removePerson(sender) {
      let list = this.peopleList;
      if (!list) return;
      let removed = list.objectAt(list.rowFor(sender));
      return this.people = this.people.filter((candidate) => candidate !== removed);
    }
    // The roster script holds rows; the outlet holds people. The awakening
    // checks the result against the outlet's type.
    decodeOutletData(name, value) {
      if (name !== "roster") return value;
      return Runtime.cast(value, "T::Array[Hash]").map((row) => Demo__SpecialPerson.fromAttributes(row));
    }
    // Escape in any owned field bubbles here through the responder chain.
    cancelOperation(event) {
      return this.clear();
    }
    clear() {
      this.resetPerson();
      return this.title;
    }
    resetPerson() {
      return this.person = new Demo__Person();
    }
    // Reached through the responder chain from a nested controller's button.
    shout() {
      return Runtime.must(this.person).name = Runtime.upcase(Runtime.must(this.person).name);
    }
  };
  var Demo__Badge = class extends Swill__Controller {
    // When this badge is window content, its count lives in the URL fragment
    // under the window's name (main.n=3) and comes back on Back/Forward.
    controllerDidRestore(restored) {
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
      return this.application().dismiss(this);
    }
  };
  var Demo__Application = class extends Swill__Application {
    applicationDidLaunch() {
      return this.launched = true;
    }
    // Alternate the main window between two templates.
    swapWindow() {
      let current = this.windowNamed("main");
      let name = Runtime.isTruthy(current && current.contentName() === "welcome") ? "farewell" : "welcome";
      return this.loadWindowContent("main", name);
    }
    openPalette() {
      return this.showWindow("palette");
    }
    // Clears every awakened controller that handles clear; the metadata
    // query is the explicit stand-in for respond_to?.
    reset() {
      return this.controllers().forEach((controller) => {
        if (Runtime.isTruthy(Runtime.respondsTo(controller, "clear"))) {
          Runtime.read(controller, "clear");
        }
      });
    }
  };
  var Demo__PeopleList = class extends Swill__Controller__EditableList {
    // How many times a different person became the selected one.
    selectedObjectDidChange(previous, object) {
      return this.selectionChanges = this.selectionChanges + 1;
    }
  };
  var Demo__PersonEditor = class extends Swill__Controller {
    // Controller-local state, reached from markup with bind="@note".
    bindingRoot() {
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
            "arity": 3,
            "js": "propertyWillChange"
          }
        }
      },
      "NameValidation": {
        factory: NameValidation,
        methods: {
          "coerce_property_value": {
            "arity": 3,
            "js": "coercePropertyValue"
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
            defaultValue: function defaultName() {
              return "";
            }
          },
          "loud": {
            type: "T::Boolean",
            attribute: false,
            defaultValue: function defaultLoud() {
              return false;
            }
          },
          "label": {
            type: "String",
            attribute: false,
            compute: function computeLabel() {
              return this.loud ? Runtime.upcase(this.name) : this.name;
            }
          },
          "blank?": {
            js: "isBlank",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_isBlank() {
              return Runtime.isBlank(this.name);
            }
          }
        },
        registries: { modelAttributes: {
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
            "arity": 1,
            "js": "rubyTruth"
          },
          "ruby_or": {
            "arity": 1,
            "js": "rubyOr"
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
            defaultValue: function defaultRole() {
              return "editor";
            }
          }
        },
        registries: { modelAttributes: {
          "role": { property: "role", key: "job" }
        } },
        methods: {
          "validate_role": {
            "arity": 2,
            "js": "validateRole"
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
            defaultValue: function defaultName2() {
              return "Ada";
            }
          },
          "baseline": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue: function defaultBaseline() {
              return null;
            }
          },
          "dirty": {
            type: "T::Boolean",
            attribute: false,
            defaultValue: function defaultDirty() {
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
            defaultValue: function defaultName3() {
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
            defaultValue: function defaultName4() {
              return "Ada";
            }
          },
          "baseline": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue: function defaultBaseline2() {
              return null;
            }
          },
          "dirty": {
            type: "T::Boolean",
            attribute: false,
            defaultValue: function defaultDirty2() {
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
            defaultValue: function defaultPerson() {
              return null;
            }
          },
          "fallback": {
            type: "String",
            attribute: false,
            defaultValue: function defaultFallback() {
              return "Nobody";
            }
          },
          "name_field": {
            js: "nameField",
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue: function default_nameField() {
              return null;
            }
          },
          "badge": {
            type: "T.nilable(Demo::Badge)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue: function defaultBadge() {
              return null;
            }
          },
          "seed": {
            type: "T.nilable(T::Hash[String, String])",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue: function defaultSeed() {
              return null;
            }
          },
          "missing": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue: function defaultMissing() {
              return null;
            }
          },
          "badge_count": {
            js: "badgeCount",
            type: "Integer",
            attribute: false,
            defaultValue: function default_badgeCount() {
              return 0;
            }
          },
          "people": {
            type: "T::Array[Demo::Person]",
            attribute: false,
            defaultValue: function defaultPeople() {
              return [];
            }
          },
          "roster": {
            type: "T.nilable(T::Array[Demo::Person])",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue: function defaultRoster() {
              return null;
            }
          },
          "people_list": {
            js: "peopleList",
            type: "T.nilable(Swill::Controller::List)",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue: function default_peopleList() {
              return null;
            }
          },
          "title": {
            type: "String",
            attribute: false,
            compute: function computeTitle() {
              let current = this.person;
              return current ? current.greeting() : this.fallback;
            }
          }
        },
        methods: {
          "view_did_load": {
            "arity": 0,
            "js": "viewDidLoad"
          },
          "awake_from_dom": {
            "arity": 0,
            "js": "awakeFromDOM"
          },
          "activate_selection": {
            "arity": 1,
            "js": "activateSelection"
          },
          "remove_person": {
            "arity": 1,
            "js": "removePerson"
          },
          "decode_outlet_data": {
            "arity": 2,
            "js": "decodeOutletData"
          },
          "cancel_operation": {
            "arity": 1,
            "js": "cancelOperation"
          },
          "clear": {
            "arity": 0
          },
          "reset_person": {
            "arity": 0,
            "js": "resetPerson"
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
            defaultValue: function defaultCount() {
              return 0;
            }
          },
          "restored": {
            type: "T::Boolean",
            attribute: false,
            defaultValue: function defaultRestored() {
              return false;
            }
          },
          "title": {
            type: "String",
            attribute: false,
            compute: function computeTitle2() {
              return `Badge ${this.count}`;
            }
          }
        },
        restorations: [{ path: "count", key: "n", type: "Integer" }],
        methods: {
          "controller_did_restore": {
            "arity": 1,
            "js": "controllerDidRestore"
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
            defaultValue: function defaultLaunched() {
              return false;
            }
          }
        },
        methods: {
          "application_did_launch": {
            "arity": 0,
            "js": "applicationDidLaunch"
          },
          "swap_window": {
            "arity": 0,
            "js": "swapWindow"
          },
          "open_palette": {
            "arity": 0,
            "js": "openPalette"
          },
          "reset": {
            "arity": 0
          }
        }
      },
      "Demo::PeopleList": {
        constructor: Demo__PeopleList,
        properties: {
          "selection_changes": {
            js: "selectionChanges",
            type: "Integer",
            attribute: false,
            defaultValue: function default_selectionChanges() {
              return 0;
            }
          }
        },
        restorations: [{ path: "selected_object_id", key: "selected", type: "T.nilable(String)" }, { path: "sort_key", key: "sort", type: "T.nilable(String)" }, { path: "sort_direction", key: "dir", type: "String" }],
        methods: {
          "selected_object_did_change": {
            "arity": 2,
            "js": "selectedObjectDidChange"
          }
        }
      },
      "Demo::PersonEditor": {
        constructor: Demo__PersonEditor,
        properties: {
          "note": {
            type: "String",
            attribute: false,
            defaultValue: function defaultNote() {
              return "";
            }
          }
        },
        methods: {
          "binding_root": {
            "arity": 0,
            "js": "bindingRoot"
          }
        }
      }
    }
  };

  // build/application.mjs
  Runtime.install(meta);
})();
//# sourceMappingURL=app.js.map
