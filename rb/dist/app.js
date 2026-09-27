(() => {
  // build/framework.external.mjs
  var framework = globalThis.Swill;
  if (!framework) throw new Error("Load swill.js before app.js");
  var Runtime = framework.Runtime;
  var Swill__Observable = framework.Swill__Observable;
  var Swill__Object = framework.Swill__Object;
  var Swill__DOM = framework.Swill__DOM;
  var Swill__Notification = framework.Swill__Notification;
  var Swill__NotificationCenter = framework.Swill__NotificationCenter;
  var Swill__Wire = framework.Swill__Wire;
  var Swill__ValueTransformer = framework.Swill__ValueTransformer;
  var Swill__NumberTransformer = framework.Swill__NumberTransformer;
  var Swill__BooleanTransformer = framework.Swill__BooleanTransformer;
  var Swill__BindingDestination = framework.Swill__BindingDestination;
  var Swill__TextBindingDestination = framework.Swill__TextBindingDestination;
  var Swill__FieldBindingDestination = framework.Swill__FieldBindingDestination;
  var Swill__SelectBindingDestination = framework.Swill__SelectBindingDestination;
  var Swill__CheckboxBindingDestination = framework.Swill__CheckboxBindingDestination;
  var Swill__ElementPropertyBindingDestination = framework.Swill__ElementPropertyBindingDestination;
  var Swill__ObjectPropertyBindingDestination = framework.Swill__ObjectPropertyBindingDestination;
  var Swill__Binding = framework.Swill__Binding;
  var Swill__ObjectBindings = framework.Swill__ObjectBindings;
  var Swill__CollectionArrangement = framework.Swill__CollectionArrangement;
  var Swill__ArrayController = framework.Swill__ArrayController;
  var Swill__Responder = framework.Swill__Responder;
  var Swill__View = framework.Swill__View;
  var Swill__Control = framework.Swill__Control;
  var Swill__Control__Button = framework.Swill__Control__Button;
  var Swill__Control__TextField = framework.Swill__Control__TextField;
  var Swill__Control__Select = framework.Swill__Control__Select;
  var Swill__Control__CustomSelect = framework.Swill__Control__CustomSelect;
  var Swill__Controller = framework.Swill__Controller;
  var Swill__Connections__Bindings = framework.Swill__Connections__Bindings;
  var Swill__Connections__Actions = framework.Swill__Connections__Actions;
  var Swill__Connections__Outlets = framework.Swill__Connections__Outlets;
  var Swill__Awakening = framework.Swill__Awakening;
  var Swill__URLFragment = framework.Swill__URLFragment;
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
  var Swill__Model__Editable = framework.Swill__Model__Editable;
  var Swill__Model__Relationships = framework.Swill__Model__Relationships;
  var Swill__Model__Relationships_ClassMethods = framework.Swill__Model__Relationships_ClassMethods;
  var Swill__Model__Store = framework.Swill__Model__Store;
  var Swill__Model__Identity = framework.Swill__Model__Identity;
  var Swill__Model__Identity_ClassMethods = framework.Swill__Model__Identity_ClassMethods;
  var Swill__Model__Collection = framework.Swill__Model__Collection;
  var Swill__Model__RelationshipCollection = framework.Swill__Model__RelationshipCollection;
  var Swill__Model__ResultSet = framework.Swill__Model__ResultSet;
  var Swill__Model__DistantClient = framework.Swill__Model__DistantClient;
  var Swill__Model__DistantData = framework.Swill__Model__DistantData;
  var Swill__Model__DistantData_ClassMethods = framework.Swill__Model__DistantData_ClassMethods;
  var Swill__Model__DistantObject = framework.Swill__Model__DistantObject;
  var Swill__Model__Relationship = framework.Swill__Model__Relationship;
  var Swill__Model__Codec = framework.Swill__Model__Codec;
  var Swill__Model__PlainJSON = framework.Swill__Model__PlainJSON;
  var Swill__Model__JSONAPI = framework.Swill__Model__JSONAPI;
  var Swill__Model__Dataset = framework.Swill__Model__Dataset;
  var Swill__Model__Resource = framework.Swill__Model__Resource;

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
  var Demo__Person = class extends Swill__Model__Editable {
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
  var Demo__Book = class extends Swill__Model__Resource {
    async loadAuthor() {
      return await this.loadRelationship("author");
    }
    async reloadAuthor() {
      return await this.reloadRelationship("author");
    }
  };
  var Demo__Author = class extends Swill__Model__Resource {
    validate() {
      return Runtime.isEmpty(Runtime.strip(this.name)) ? "name must not be blank" : null;
    }
    async loadBooks() {
      return await this.loadRelationship("books");
    }
    async reloadBooks() {
      return await this.reloadRelationship("books");
    }
  };
  var Demo__Note = class extends Swill__Model__Resource {
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
          value = Runtime.send(value, "strip");
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
      this.bind("badge_count", Runtime.keywordArguments({
        to: Runtime.must(this.badge),
        key_path: "count"
      }));
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
      let name = Runtime.isTruthy(current && current.contentName === "welcome") ? "farewell" : "welcome";
      return this.loadWindowContent("main", name);
    }
    openPalette() {
      return this.showWindow("palette");
    }
    // Clears every awakened controller that handles clear; the metadata
    // query is the explicit stand-in for respond_to?.
    reset() {
      return this.controllers.forEach((controller) => {
        if (Runtime.isTruthy(Runtime.respondsTo(controller, "clear"))) {
          Runtime.send(controller, "clear");
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
  function Demo__PersonFilter(Superclass) {
    class Demo__PersonFilter_Layer extends Superclass {
      includesObject(object) {
        return Runtime.downcase(Runtime.cast(object, "Demo::Person").name).includes(Runtime.downcase(this.filterText));
      }
    }
    return Demo__PersonFilter_Layer;
  }
  var Demo__FilteredPeopleList = class extends Swill__Controller__SortableList {
  };
  var Demo__PeopleArrayController = class extends Swill__ArrayController {
  };
  var Demo__FilteredPeopleController = class extends Swill__Controller {
  };
  var Static__User = class extends Swill__Model__Editable {
    validateEmail(value, _previous) {
      return Runtime.downcase(Runtime.strip(value));
    }
  };
  var Static__Contact = class extends Swill__Object {
    constructor(name, role) {
      super();
      this.name = name;
      this.role = role;
    }
  };
  var Static__Application = class extends Swill__Application {
  };
  var Static__Menubar = class extends Swill__Controller {
    controllerDidLoad() {
      this.observeNotification(
        "example_did_change",
        (notification) => this.syncSelectedExample(notification.userInfo)
      );
      let main = this.application().windowNamed("main");
      let name = main ? main.contentName : null;
      if (name != null) return this.syncSelectedExample(name);
    }
    showExample(sender) {
      return this.application().loadWindowContent(
        "main",
        Runtime.must(sender.getAttribute("data-example"))
      );
    }
    showPalette() {
      return this.application().showWindow("palette");
    }
    showIntro() {
      return this.application().loadWindowContent(
        "workspace",
        "intro-pane"
      );
    }
    showDetails() {
      return this.application().loadWindowContent(
        "workspace",
        "details-pane"
      );
    }
    syncSelectedExample(name) {
      return this.view.element.querySelectorAll("[data-example]").forEach((button) => button.setAttribute(
        "aria-pressed",
        button.getAttribute("data-example") === name ? "true" : "false"
      ));
    }
  };
  var Static__Pane = class extends Swill__Controller {
    exampleName() {
      return "";
    }
    controllerDidLoad() {
      return Swill__NotificationCenter.default().post(
        "example_did_change",
        this,
        this.exampleName()
      );
    }
  };
  var Static__BindingsPane = class extends Static__Pane {
    // Recomputed whenever user.name changes through the binding on the field.
    exampleName() {
      return "bindings";
    }
    viewDidLoad() {
      this.user = Static__User.fromAttributes({
        id: "demo",
        name: "world",
        email_address: ""
      });
      return this.draft = Runtime.must(this.user).draft();
    }
    controllerDidLoad() {
      super.controllerDidLoad();
      this.observeNotification("counter_changed", (notification) => this.lastNotification = `Counter changed to ${notification.userInfo}`);
      this.observeNotification(
        "first_responder_did_change",
        (notification) => this.updateFirstResponderDebug(notification.userInfo)
      );
      Runtime.must(this.draftEditor).representedObject = this.draft;
      this.application().makeFirstResponder(Runtime.must(this.nameField));
      return this.updateFirstResponderDebug(this.application().firstResponder());
    }
    // The field focuses itself as it becomes first responder.
    updateFirstResponderDebug(responder) {
      return this.firstResponderDebug = this.describeResponder(responder);
    }
    describeResponder(responder) {
      if (!responder) return "None";
      let name = Runtime.logicalOr(
        Runtime.nameOf(responder),
        () => "Object"
      );
      if (!(responder instanceof Swill__View)) return name;
      let element = Runtime.cast(responder, "Swill::View").element;
      let tag = Runtime.downcase(element.tagName);
      let id = element.getAttribute("id");
      let outlet = element.getAttribute("outlet");
      let identity = id != null ? `#${id}` : (() => {
        return outlet != null ? `${tag}[outlet=${outlet}]` : tag;
      })();
      return `${name} ${identity}`;
    }
    clear() {
      let current = Runtime.must(this.user);
      current.name = "";
      return current.email = "";
    }
    fakeSave() {
      this.saving = true;
      return Runtime.must(this.user).markCleanBang();
    }
    // The draft is a detached buffer: nothing reaches the user until applied.
    applyDraft() {
      let current = Runtime.must(this.user);
      current.applyDraft(this.draft);
      current.markCleanBang();
      return this.resetDraft();
    }
    resetDraft() {
      this.draft = Runtime.must(this.user).draft();
      return Runtime.must(this.draftEditor).representedObject = this.draft;
    }
  };
  var Static__DraftEditor = class extends Swill__Controller__Editor {
    commitEditing() {
      this.pane().applyDraft();
      return true;
    }
    discardEditing() {
      return this.pane().resetDraft();
    }
    pane() {
      return Runtime.cast(
        Runtime.must(this.parent()),
        "Static::BindingsPane"
      );
    }
  };
  var Static__Card = class extends Swill__Controller {
    bindingRoot() {
      return "represented_object";
    }
    viewDidLoad() {
      return this.representedObject = Static__User.fromAttributes({ name: "Ada" });
    }
  };
  var Static__Counter = class extends Swill__Controller {
    increment() {
      this.count = this.count + 1;
      return Swill__NotificationCenter.default().post(
        "counter_changed",
        this,
        this.count
      );
    }
  };
  var Static__ControlsPane = class extends Static__Pane {
    exampleName() {
      return "controls";
    }
    controllerDidLoad() {
      super.controllerDidLoad();
      let select = Runtime.must(this.standaloneSelect);
      select.options = ["Ada", "Grace", "Katherine"];
      select.value = "Grace";
      return Runtime.must(this.customSelect).options = [
        { value: "ada", label: "Ada Lovelace", description: "Mathematician" },
        {
          value: "grace",
          label: "Grace Hopper",
          description: "Computer scientist"
        },
        {
          value: "katherine",
          label: "Katherine Johnson",
          description: "Engineer"
        }
      ];
    }
  };
  var Static__DataPane = class extends Static__Pane {
    exampleName() {
      return "data";
    }
    controllerDidLoad() {
      super.controllerDidLoad();
      return Runtime.must(this.peopleList).representedObject = [
        new Static__Contact("Ada", "Mathematician"),
        new Static__Contact("Grace", "Computer scientist"),
        new Static__Contact("Katherine", "Engineer")
      ];
    }
    activateSelection(sender) {
      let selected = sender.selectedObject;
      return this.activatedPerson = Runtime.isTruthy(selected) ? Runtime.send(
        selected,
        "name"
      ) : "None";
    }
  };
  var Static__Palette = class extends Swill__Controller {
    controllerDidLoad() {
      return this.application().makeFirstResponder(Runtime.must(this.field));
    }
    close() {
      return this.application().dismiss(this);
    }
  };
  var Static__IntroPane = class extends Swill__Controller {
    // The number input writes text; the property holds a number.
    coercePropertyValue(name, value, previous) {
      return name === "page" ? Runtime.send(value, "to_i") : value;
    }
    controllerDidLoad() {
      return this.application().makeFirstResponder(Runtime.must(this.field));
    }
  };
  var Static__DetailsPane = class extends Swill__Controller {
    controllerDidLoad() {
      return this.application().makeFirstResponder(Runtime.must(this.field));
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
      },
      "Demo::PersonFilter": {
        factory: Demo__PersonFilter,
        methods: {
          "includes_object?": {
            "arity": 1,
            "js": "includesObject"
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
            defaultValue() {
              return "";
            }
          },
          "loud": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
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
        registries: {
          modelAttributes: { "id": { "name": "id", "key": "id", "type": "T.nilable(String)", "default": null }, "name": { "name": "name", "key": "name", "type": "String", "default": "" } }
        },
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
            defaultValue() {
              return "editor";
            }
          }
        },
        registries: {
          modelAttributes: { "id": { "name": "id", "key": "id", "type": "T.nilable(String)", "default": null }, "name": { "name": "name", "key": "name", "type": "String", "default": "" }, "role": { "name": "role", "key": "job", "type": "String", "default": "editor" } }
        },
        methods: {
          "validate_role": {
            "arity": 2,
            "js": "validateRole"
          }
        }
      },
      "Demo::Book": {
        constructor: Demo__Book,
        properties: {
          "title": {
            type: "String",
            attribute: true,
            key: "title",
            defaultValue() {
              return "";
            }
          },
          "author": {
            type: "T.nilable(Demo::Author)",
            attribute: false,
            willAccess: true,
            defaultValue() {
              return null;
            }
          },
          "author_loading": {
            js: "authorLoading",
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "author_loaded": {
            js: "authorLoaded",
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "author_error": {
            js: "authorError",
            type: "T.nilable(String)",
            attribute: false,
            defaultValue() {
              return null;
            }
          }
        },
        registries: {
          modelRelationships: { "author": { "name": "author", "key": "author", "kind": "one", "type": "Demo::Author", "url": null } },
          modelAttributes: { "id": { "name": "id", "key": "id", "type": "T.nilable(String)", "default": null }, "title": { "name": "title", "key": "title", "type": "String", "default": "" } }
        },
        settings: [{ name: "endpoint", js: "endpoint", value: "/api/books" }, { name: "resource_type", js: "resourceType", value: "books" }],
        methods: {
          "load_author": {
            "arity": 0,
            "js": "loadAuthor"
          },
          "reload_author": {
            "arity": 0,
            "js": "reloadAuthor"
          }
        }
      },
      "Demo::Author": {
        constructor: Demo__Author,
        properties: {
          "name": {
            type: "String",
            attribute: true,
            key: "name",
            defaultValue() {
              return "";
            }
          },
          "born": {
            type: "T.nilable(Integer)",
            attribute: true,
            key: "born",
            defaultValue() {
              return null;
            }
          },
          "books": {
            type: "T::Array[Demo::Book]",
            attribute: false,
            willAccess: true,
            defaultValue() {
              return [];
            }
          },
          "books_loading": {
            js: "booksLoading",
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "books_loaded": {
            js: "booksLoaded",
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "books_error": {
            js: "booksError",
            type: "T.nilable(String)",
            attribute: false,
            defaultValue() {
              return null;
            }
          }
        },
        registries: {
          modelRelationships: { "books": { "name": "books", "key": "books", "kind": "many", "type": "Demo::Book", "url": "/api/authors/:id/books" } },
          modelAttributes: { "id": { "name": "id", "key": "id", "type": "T.nilable(String)", "default": null }, "name": { "name": "name", "key": "name", "type": "String", "default": "" }, "born": { "name": "born", "key": "born", "type": "T.nilable(Integer)", "default": null } }
        },
        settings: [{ name: "endpoint", js: "endpoint", value: "/api/authors" }, { name: "resource_type", js: "resourceType", value: "authors" }],
        methods: {
          "validate": {
            "arity": 0
          },
          "load_books": {
            "arity": 0,
            "js": "loadBooks"
          },
          "reload_books": {
            "arity": 0,
            "js": "reloadBooks"
          }
        }
      },
      "Demo::Note": {
        constructor: Demo__Note,
        properties: {
          "body": {
            type: "String",
            attribute: true,
            key: "body",
            defaultValue() {
              return "";
            }
          }
        },
        registries: {
          modelAttributes: { "id": { "name": "id", "key": "id", "type": "T.nilable(String)", "default": null }, "body": { "name": "body", "key": "body", "type": "String", "default": "" } }
        },
        settings: [{ name: "endpoint", js: "endpoint", value: "/api/notes" }, { name: "codec", js: "codec", value: Swill__Model__PlainJSON }],
        methods: {}
      },
      "ConcernRecord": {
        constructor: ConcernRecord,
        mixins: [NameTracking, NameValidation],
        properties: {
          "name": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "Ada";
            }
          },
          "baseline": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "dirty": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
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
            attribute: false,
            defaultValue() {
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
            attribute: false,
            defaultValue() {
              return "Ada";
            }
          },
          "baseline": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "dirty": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
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
            defaultValue() {
              return null;
            }
          },
          "fallback": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "Nobody";
            }
          },
          "name_field": {
            js: "nameField",
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "badge": {
            type: "T.nilable(Demo::Badge)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "seed": {
            type: "T.nilable(T::Hash[String, String])",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "missing": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue() {
              return null;
            }
          },
          "badge_count": {
            js: "badgeCount",
            type: "Integer",
            attribute: false,
            defaultValue() {
              return 0;
            }
          },
          "people": {
            type: "T::Array[Demo::Person]",
            attribute: false,
            defaultValue() {
              return [];
            }
          },
          "roster": {
            type: "T.nilable(T::Array[Demo::Person])",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue() {
              return null;
            }
          },
          "people_list": {
            js: "peopleList",
            type: "T.nilable(Swill::Controller::List)",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue() {
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
            defaultValue() {
              return 0;
            }
          },
          "restored": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
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
            defaultValue() {
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
            defaultValue() {
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
            defaultValue() {
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
      },
      "Demo::FilteredPeopleList": {
        constructor: Demo__FilteredPeopleList,
        mixins: [Demo__PersonFilter],
        properties: {
          "filter_text": {
            js: "filterText",
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          }
        },
        methods: {}
      },
      "Demo::PeopleArrayController": {
        constructor: Demo__PeopleArrayController,
        mixins: [Demo__PersonFilter],
        properties: {
          "filter_text": {
            js: "filterText",
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          }
        },
        methods: {}
      },
      "Demo::FilteredPeopleController": {
        constructor: Demo__FilteredPeopleController,
        mixins: [Swill__CollectionArrangement, Demo__PersonFilter],
        properties: {
          "content": {
            type: "T.untyped",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "array_controller": {
            js: "arrayController",
            type: "T.nilable(Swill::ArrayController)",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "arrangement_options": {
            js: "arrangementOptions",
            type: "T::Hash[String, T.untyped]",
            attribute: false,
            defaultValue() {
              return {};
            }
          },
          "selection_state": {
            js: "selectionState",
            type: "T::Hash[String, T.untyped]",
            attribute: false,
            defaultValue() {
              return {};
            }
          },
          "arranged_content": {
            js: "arrangedContent",
            type: "T::Array[T.untyped]",
            attribute: false,
            compute: function compute_arrangedContent() {
              return this.arrangeContent();
            }
          },
          "selected_objects": {
            js: "selectedObjects",
            type: "T::Array[T.untyped]",
            attribute: false,
            writer: "selectObjects",
            compute: function compute_selectedObjects() {
              return this.arrangedSelection();
            }
          },
          "selected_object_id": {
            js: "selectedObjectId",
            type: "T.nilable(String)",
            attribute: false,
            writer: "selectIdentifier",
            compute: function compute_selectedObjectId() {
              let controller = this.arrayController;
              return controller ? controller.selectedObjectId : Runtime.cast(
                Runtime.logicalOr(this.selectionState.id, () => null),
                "T.nilable(String)"
              );
            }
          },
          "selected_object": {
            js: "selectedObject",
            type: "T.untyped",
            attribute: false,
            compute: function compute_selectedObject() {
              return Runtime.isEmpty(this.selectedObjects) ? null : this.selectedObjects[0];
            }
          },
          "selected_indexes": {
            js: "selectedIndexes",
            type: "T::Array[Integer]",
            attribute: false,
            compute: function compute_selectedIndexes() {
              let selected = this.selectedObjects;
              let indexes = Runtime.cast([], "T::Array[Integer]");
              this.arrangedObjects().forEach((object, index) => {
                if (selected.includes(object)) Runtime.append(indexes, index);
              });
              return indexes;
            }
          },
          "sort_key": {
            js: "sortKey",
            type: "T.nilable(String)",
            attribute: false,
            writer: "changeSortKey",
            compute: function compute_sortKey() {
              let controller = this.arrayController;
              return controller ? controller.sortKey : Runtime.cast(
                Runtime.logicalOr(this.arrangementOptions.key, () => null),
                "T.nilable(String)"
              );
            }
          },
          "sort_direction": {
            js: "sortDirection",
            type: "String",
            attribute: false,
            writer: "changeSortDirection",
            compute: function compute_sortDirection() {
              let controller = this.arrayController;
              return controller ? controller.sortDirection : Runtime.cast(
                Runtime.logicalOr(
                  this.arrangementOptions.direction,
                  () => "ascending"
                ),
                "String"
              );
            }
          },
          "sort_states": {
            js: "sortStates",
            type: "T::Hash[String, String]",
            attribute: false,
            compute: function compute_sortStates() {
              let key = this.sortKey;
              return key != null ? { [key]: this.sortDirection } : {};
            }
          },
          "filter_text": {
            js: "filterText",
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          }
        },
        methods: {}
      },
      "Static::User": {
        constructor: Static__User,
        properties: {
          "name": {
            type: "String",
            attribute: true,
            key: "name",
            defaultValue() {
              return "world";
            }
          },
          "email": {
            type: "String",
            attribute: true,
            key: "email_address",
            defaultValue() {
              return "";
            }
          },
          "blank_email?": {
            js: "isBlankEmail",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_isBlankEmail() {
              return Runtime.isEmpty(Runtime.strip(this.email));
            }
          },
          "present_email?": {
            js: "isPresentEmail",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_isPresentEmail() {
              return !this.isBlankEmail;
            }
          },
          "clean?": {
            js: "isClean",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_isClean() {
              return !this.isDirty;
            }
          }
        },
        registries: {
          modelAttributes: { "id": { "name": "id", "key": "id", "type": "T.nilable(String)", "default": null }, "name": { "name": "name", "key": "name", "type": "String", "default": "world" }, "email": { "name": "email", "key": "email_address", "type": "String", "default": "" } }
        },
        methods: {
          "validate_email": {
            "arity": 2,
            "js": "validateEmail"
          }
        }
      },
      "Static::Contact": {
        constructor: Static__Contact,
        properties: {
          "name": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          },
          "role": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          }
        },
        methods: {
          "initialize": {
            "arity": 2
          }
        }
      },
      "Static::Application": {
        constructor: Static__Application,
        properties: {},
        methods: {}
      },
      "Static::Menubar": {
        constructor: Static__Menubar,
        properties: {},
        methods: {
          "controller_did_load": {
            "arity": 0,
            "js": "controllerDidLoad"
          },
          "show_example": {
            "arity": 1,
            "js": "showExample"
          },
          "show_palette": {
            "arity": 0,
            "js": "showPalette"
          },
          "show_intro": {
            "arity": 0,
            "js": "showIntro"
          },
          "show_details": {
            "arity": 0,
            "js": "showDetails"
          },
          "sync_selected_example": {
            "arity": 1,
            "js": "syncSelectedExample"
          }
        }
      },
      "Static::Pane": {
        constructor: Static__Pane,
        properties: {},
        methods: {
          "example_name": {
            "arity": 0,
            "js": "exampleName"
          },
          "controller_did_load": {
            "arity": 0,
            "js": "controllerDidLoad"
          }
        }
      },
      "Static::BindingsPane": {
        constructor: Static__BindingsPane,
        properties: {
          "user": {
            type: "T.nilable(Static::User)",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "draft": {
            type: "T.nilable(Static::User)",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "saving": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "first_responder_debug": {
            js: "firstResponderDebug",
            type: "String",
            attribute: false,
            defaultValue() {
              return "None";
            }
          },
          "last_notification": {
            js: "lastNotification",
            type: "String",
            attribute: false,
            defaultValue() {
              return "None";
            }
          },
          "name_field": {
            js: "nameField",
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "draft_editor": {
            js: "draftEditor",
            type: "T.nilable(Static::DraftEditor)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "greeting": {
            type: "String",
            attribute: false,
            compute: function computeGreeting() {
              let current = this.user;
              return current ? `Hello, ${current.name}!` : "";
            }
          },
          "summary": {
            type: "String",
            attribute: false,
            compute: function computeSummary() {
              let current = this.user;
              let email = current ? Runtime.strip(current.email) : "";
              return Runtime.isEmpty(email) ? "No email." : `Email: ${email}`;
            }
          }
        },
        methods: {
          "example_name": {
            "arity": 0,
            "js": "exampleName"
          },
          "view_did_load": {
            "arity": 0,
            "js": "viewDidLoad"
          },
          "controller_did_load": {
            "arity": 0,
            "js": "controllerDidLoad"
          },
          "update_first_responder_debug": {
            "arity": 1,
            "js": "updateFirstResponderDebug"
          },
          "describe_responder": {
            "arity": 1,
            "js": "describeResponder"
          },
          "clear": {
            "arity": 0
          },
          "fake_save": {
            "arity": 0,
            "js": "fakeSave"
          },
          "apply_draft": {
            "arity": 0,
            "js": "applyDraft"
          },
          "reset_draft": {
            "arity": 0,
            "js": "resetDraft"
          }
        }
      },
      "Static::DraftEditor": {
        constructor: Static__DraftEditor,
        properties: {},
        methods: {
          "commit_editing": {
            "arity": 0,
            "js": "commitEditing"
          },
          "discard_editing": {
            "arity": 0,
            "js": "discardEditing"
          },
          "pane": {
            "arity": 0
          }
        }
      },
      "Static::Card": {
        constructor: Static__Card,
        properties: {
          "note": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          },
          "note_blank?": {
            js: "isNoteBlank",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_isNoteBlank() {
              return Runtime.isEmpty(Runtime.strip(this.note));
            }
          }
        },
        methods: {
          "binding_root": {
            "arity": 0,
            "js": "bindingRoot"
          },
          "view_did_load": {
            "arity": 0,
            "js": "viewDidLoad"
          }
        }
      },
      "Static::Counter": {
        constructor: Static__Counter,
        properties: {
          "count": {
            type: "Integer",
            attribute: false,
            defaultValue() {
              return 0;
            }
          }
        },
        methods: {
          "increment": {
            "arity": 0
          }
        }
      },
      "Static::ControlsPane": {
        constructor: Static__ControlsPane,
        properties: {
          "selected_person": {
            js: "selectedPerson",
            type: "String",
            attribute: false,
            defaultValue() {
              return "ada";
            }
          },
          "standalone_text_field": {
            js: "standaloneTextField",
            type: "T.nilable(Swill::Control::TextField)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "standalone_select": {
            js: "standaloneSelect",
            type: "T.nilable(Swill::Control::Select)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "custom_select": {
            js: "customSelect",
            type: "T.nilable(Swill::Control::CustomSelect)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          }
        },
        methods: {
          "example_name": {
            "arity": 0,
            "js": "exampleName"
          },
          "controller_did_load": {
            "arity": 0,
            "js": "controllerDidLoad"
          }
        }
      },
      "Static::DataPane": {
        constructor: Static__DataPane,
        properties: {
          "activated_person": {
            js: "activatedPerson",
            type: "String",
            attribute: false,
            defaultValue() {
              return "None";
            }
          },
          "people_list": {
            js: "peopleList",
            type: "T.nilable(Swill::Controller::EditableList)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "selected_people": {
            js: "selectedPeople",
            type: "String",
            attribute: false,
            compute: function compute_selectedPeople() {
              let list = this.peopleList;
              return list ? list.selectedObjects.map((contact) => Runtime.send(contact, "name")).join(", ") : "";
            }
          }
        },
        methods: {
          "example_name": {
            "arity": 0,
            "js": "exampleName"
          },
          "controller_did_load": {
            "arity": 0,
            "js": "controllerDidLoad"
          },
          "activate_selection": {
            "arity": 1,
            "js": "activateSelection"
          }
        }
      },
      "Static::Palette": {
        constructor: Static__Palette,
        properties: {
          "field": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          }
        },
        methods: {
          "controller_did_load": {
            "arity": 0,
            "js": "controllerDidLoad"
          },
          "close": {
            "arity": 0
          }
        }
      },
      "Static::IntroPane": {
        constructor: Static__IntroPane,
        properties: {
          "query": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "Ruby";
            }
          },
          "page": {
            type: "Integer",
            attribute: false,
            defaultValue() {
              return 1;
            }
          },
          "field": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          }
        },
        restorations: [{ path: "query", key: "q", type: "String" }, { path: "page", key: "page", type: "Integer" }],
        methods: {
          "coerce_property_value": {
            "arity": 3,
            "js": "coercePropertyValue"
          },
          "controller_did_load": {
            "arity": 0,
            "js": "controllerDidLoad"
          }
        }
      },
      "Static::DetailsPane": {
        constructor: Static__DetailsPane,
        properties: {
          "query": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "Details";
            }
          },
          "field": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          }
        },
        restorations: [{ path: "query", key: "q", type: "String" }],
        methods: {
          "controller_did_load": {
            "arity": 0,
            "js": "controllerDidLoad"
          }
        }
      }
    }
  };

  // build/application.mjs
  Runtime.install(meta);
})();
//# sourceMappingURL=app.js.map
