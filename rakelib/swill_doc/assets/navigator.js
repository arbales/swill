// The left pane: a plain JavaScript Swill application on the UI build.
//
// Three Swill.Lists show the files, classes, and methods in search_index.js,
// each bound to a computed property that follows the query. Entries are
// ordinary links, so choosing one loads that page.
//
// Read as Ruby, the class index lists every class. Read as JavaScript, it
// lists the classes JavaScript has a name for; the rest are the
// implementation, and follow under one row that opens and closes, and opens
// by itself while a query matches any of them.
//
// Keys: ~ moves to the search; arrows move through the results, in the order
// they appear; Enter opens the selected result, or the first, or opens or
// closes the implementation; Escape abandons
// the query and leaves the search.
//
// The pane's width and the first two indexes' heights can be dragged, and are
// remembered from page to page, along with each index’s scroll position and
// whether its section is open. Click a section heading to open or close it.
//
// The language switch chooses whether pages read as Ruby or as JavaScript; the
// choice is remembered, and the indexes follow it.
(() => {
  const root = document.documentElement.dataset.root ?? "";
  const index = globalThis.SwillDocIndex;
  const linked = entries => entries.map(entry => ({...entry, href: root + entry.url}));
  const files = linked(index.files);
  const classes = linked(index.classes);
  const publicClasses = classes.filter(entry => !entry.internal);
  const internalClasses = classes.filter(entry => entry.internal);
  const methods = linked(index.methods);

  const matching = (entries, query, key) => {
    const wanted = query.trim().toLowerCase();
    if (!wanted) return entries;
    return entries.filter(entry => entry[key].toLowerCase().includes(wanted));
  };

  const layoutKey = "swill-doc-layout";
  const storedLayout = () => {
    try { return JSON.parse(localStorage.getItem(layoutKey)) ?? {}; } catch { return {}; }
  };
  const storeLayout = layout => {
    try { localStorage.setItem(layoutKey, JSON.stringify(layout)); } catch { /* private browsing */ }
  };

  // Dragging +handle+ calls +begin+, then +resize+ with how far the pointer
  // has moved since, then +done+. Answers the disposer that stops listening.
  const draggable = (handle, begin, resize, done) => {
    const down = event => {
      if (event.button !== 0) return;
      let dragging = false;
      const move = moved => {
        const dx = moved.clientX - event.clientX;
        const dy = moved.clientY - event.clientY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < 4 || begin() === false) return;
          dragging = true;
          handle.setPointerCapture(event.pointerId);
        }
        moved.preventDefault();
        resize(dx, dy);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (dragging) {
          const suppress = click => { click.preventDefault(); click.stopPropagation(); };
          handle.addEventListener("click", suppress, {capture: true, once: true});
          setTimeout(() => handle.removeEventListener("click", suppress, true), 0);
          done();
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
    handle.addEventListener("pointerdown", down);
    return () => handle.removeEventListener("pointerdown", down);
  };

  const languageKey = "swill-doc-language";
  const internalKey = "swill-doc-internal";
  const currentLanguage = () => document.documentElement.dataset.language === "javascript" ? "javascript" : "ruby";

  // An entry as it reads in a language: its JavaScript spelling, where it has
  // one, replaces its Ruby one.
  const spelled = (entries, language) =>
    language === "javascript" ? entries.map(entry => entry.js ? {...entry, ...entry.js} : entry) : entries;

  // A field keeps the keys typed into it.
  const typing = target => target?.closest?.("input, textarea, select, [contenteditable]");

  class DocNavigator extends Swill.Controller {
    static properties = {query: {default: ""}, language: {default: "ruby"}, internalOpen: {default: false}};
    static outlets = {fileList: {}, classList: {}, methodList: {}};
    static actions = ["toggleInternal"];

    get files() { return matching(files, this.query, "name"); }

    // Every class in Ruby; in JavaScript, the named classes, then the
    // implementation under its row.
    get classes() {
      if (this.language !== "javascript") return matching(classes, this.query, "search");
      const shown = spelled(matching(publicClasses, this.query, "search"), this.language);
      const internal = matching(internalClasses, this.query, "search");
      if (internal.length === 0) return shown;
      const open = this.internalOpen || this.query.trim() !== "";
      return [...shown, {group: true, label: "Implementation", open}, ...(open ? internal : [])];
    }
    get methods() { return spelled(matching(methods, this.query, "search"), this.language); }

    viewDidLoad() {
      this.cursor = -1;
      try { this.internalOpen = localStorage.getItem(internalKey) === "open"; } catch { /* private browsing */ }
      this.language = currentLanguage();
      this.observe("query", () => {
        this.select(-1);
        requestAnimationFrame(() => this.restoreScroll?.());
      });
      this.observeNotification("language_did_change", notification => {
        this.language = notification.userInfo;
      });
    }

    awakeFromDOM() {
      const pane = this.view.element;
      const layout = storedLayout();
      const apply = () => {
        if (layout.width) {
          pane.style.width = `${layout.width}px`;
          pane.style.maxWidth = "none";
        }
        for (const name of ["file-index", "class-index"]) {
          if (!layout[name]) continue;
          const list = pane.querySelector(`.${name}`);
          list.style.height = `${layout[name]}px`;
          list.style.maxHeight = "none";
        }
      };
      apply();
      layout.scroll ??= {};
      layout.collapsed ??= {};
      const sections = [...pane.querySelectorAll("[data-section]")].map(button => ({
        button, name: button.dataset.section, list: pane.querySelector(`#${button.dataset.section}`)
      }));
      const listen = (element, type, callback) => {
        element.addEventListener(type, callback);
        this.retain(() => element.removeEventListener(type, callback));
      };
      this.restoreScroll = () => {
        if (this.query.trim()) return;
        for (const {name, list} of sections) {
          if (!list.hasAttribute("data-collapsed")) list.scrollTop = layout.scroll[name] ?? 0;
        }
      };
      for (const {button, name, list} of sections) {
        const collapse = () => {
          const closed = !!layout.collapsed[name];
          list.toggleAttribute("data-collapsed", closed);
          button.setAttribute("aria-expanded", String(!closed));
        };
        collapse();
        listen(list, "scroll", () => {
          if (this.query.trim() || list.hidden || list.hasAttribute("data-collapsed")) return;
          layout.scroll[name] = list.scrollTop;
          storeLayout(layout);
        });
        listen(button, "click", () => {
          layout.collapsed[name] = !layout.collapsed[name];
          collapse();
          this.select(-1);
          this.restoreScroll();
          storeLayout(layout);
        });
      }
      this.restoreScroll();
      document.fonts.ready.then(() => this.restoreScroll());
      let start = 0;
      this.retain(draggable(pane.querySelector(".width-handle"),
        () => { start = pane.getBoundingClientRect().width; },
        dx => {
          layout.width = Math.round(Math.min(640, Math.max(220, start + dx)));
          apply();
        },
        () => storeLayout(layout)));
      for (const header of pane.querySelectorAll("[data-resizes]")) {
        const name = header.dataset.resizes;
        const list = pane.querySelector(`.${name}`);
        this.retain(draggable(header,
          () => {
            if (list.hidden || list.hasAttribute("data-collapsed")) return false;
            start = list.getBoundingClientRect().height;
          },
          (_dx, dy) => {
            layout[name] = Math.round(Math.max(40, start + dy));
            apply();
          },
          () => storeLayout(layout)));
      }
    }

    toggleInternal() {
      this.internalOpen = !this.internalOpen;
      try { localStorage.setItem(internalKey, this.internalOpen ? "open" : "closed"); } catch { /* private browsing */ }
    }

    // Every result, in the order the lists show them.
    results() {
      return [this.fileList, this.classList, this.methodList]
        .filter(list => !list.view.element.hasAttribute("data-collapsed"))
        .flatMap(list =>
        list.arrangedObjects().map((entry, index) => ({list, index, entry})));
    }

    // Selects the result at +position+ in its own list, and nothing in the
    // others; -1 selects nothing.
    select(position) {
      const results = this.results();
      const chosen = results[position];
      for (const list of [this.fileList, this.classList, this.methodList]) {
        if (list !== chosen?.list) list.deselectAll();
      }
      if (chosen) chosen.list.selectIndexes([chosen.index]);
      this.cursor = chosen ? position : -1;
    }

    keyDown(event) {
      if (event.target?.closest?.(".section-toggle")) return;
      const step = {ArrowDown: 1, ArrowUp: -1}[event.key];
      if (!step) return super.keyDown(event);
      event.preventDefault();
      const last = this.results().length - 1;
      this.select(Math.max(-1, Math.min(last, this.cursor + step)));
    }

    // Enter opens the selected result, or the first, preferring a class to a
    // method to a file.
    insertNewline(event) {
      if (event.target?.closest?.(".section-toggle")) return;
      const results = this.results();
      const chosen = (results[this.cursor] ?? results.find(result => result.list === this.classList) ??
        results.find(result => result.list === this.methodList) ?? results[0])?.entry;
      if (!chosen) return;
      event.preventDefault();
      if (chosen.group) this.toggleInternal();
      else window.location.href = chosen.href;
    }

    // Escape abandons the query and leaves the search; the application holds
    // the keyboard again.
    cancelOperation(event) {
      event.preventDefault();
      this.query = "";
      this.application().makeFirstResponder(null);
    }
  }

  // Ruby or JavaScript, for every page: the choice is the document's
  // data-language, which the stylesheet follows, and it is remembered.
  class LanguageSwitch extends Swill.Controller {
    static properties = {language: {default: "ruby"}};
    static actions = ["useRuby", "useJavaScript"];

    get ruby() { return this.language === "ruby"; }
    get javascript() { return this.language === "javascript"; }

    viewDidLoad() { this.language = currentLanguage(); }

    useRuby() { this.choose("ruby"); }
    useJavaScript() { this.choose("javascript"); }

    choose(language) {
      this.language = language;
      document.documentElement.dataset.language = language;
      try { localStorage.setItem(languageKey, language); } catch { /* private browsing */ }
      Swill.NotificationCenter.default().post("language_did_change", this, language);
    }
  }

  // ~ anywhere outside a field moves to the search.
  class DocApplication extends Swill.Application {
    keyDown(event) {
      if ((event.key === "`" || event.key === "~") && !typing(event.target)) {
        const navigator = this.controllers.find(controller => controller instanceof DocNavigator);
        if (navigator) {
          event.preventDefault();
          this.makeFirstResponder(navigator);
          return;
        }
      }
      super.keyDown(event);
    }
  }

  Swill.register(DocNavigator);
  Swill.register(LanguageSwitch);
  Swill.register(DocApplication);
  Swill.start({application: DocApplication});
})();
