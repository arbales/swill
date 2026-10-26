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
// closes the implementation; Escape abandons the query and leaves the search.
//
// The pane's width and the first two indexes' heights can be dragged, and are
// remembered from page to page, along with each index's scroll position and
// whether its section is open. Click a section heading to open or close it.
//
// The language switch chooses whether pages read as Ruby or as JavaScript; the
// choice is remembered, and the indexes follow it.
(() => {
  // ---- the index ----

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

  // An entry as it reads in a language: its JavaScript spelling, where it has
  // one, replaces its Ruby one.
  const spelled = (entries, language) =>
    language === "javascript" ? entries.map(entry => entry.js ? {...entry, ...entry.js} : entry) : entries;

  const currentLanguage = () => document.documentElement.dataset.language === "javascript" ? "javascript" : "ruby";

  // ---- what is remembered ----

  // localStorage, which private browsing may refuse.
  const stored = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* private browsing */ }
    },
    object(key) {
      try { return JSON.parse(this.get(key)) ?? {}; } catch { return {}; }
    }
  };

  // ---- dragging ----

  // The click that ends a drag is not a click on what was dragged.
  const swallowNextClick = element => {
    const swallow = click => { click.preventDefault(); click.stopPropagation(); };
    element.addEventListener("click", swallow, {capture: true, once: true});
    setTimeout(() => element.removeEventListener("click", swallow, true));
  };

  // Dragging +handle+ resizes something. +start+ answers its size as the drag
  // begins, or false to refuse it; +move+ takes that size and how far the
  // pointer has moved; +end+ runs when it is let go. A press that moves less
  // than four pixels is a click. Answers the disposer.
  const draggable = (handle, {start, move, end}) => {
    const pressed = press => {
      if (press.button !== 0) return;
      let from = null;
      const pointer = new AbortController();
      const moved = event => {
        const dx = event.clientX - press.clientX;
        const dy = event.clientY - press.clientY;
        if (from === null) {
          if (Math.hypot(dx, dy) < 4) return;
          from = start();
          if (from === false) return pointer.abort();
          handle.setPointerCapture(press.pointerId);
        }
        event.preventDefault();
        move(from, dx, dy);
      };
      const released = () => {
        pointer.abort();
        if (from === null) return;
        swallowNextClick(handle);
        end();
      };
      window.addEventListener("pointermove", moved, {signal: pointer.signal});
      window.addEventListener("pointerup", released, {signal: pointer.signal});
      window.addEventListener("pointercancel", released, {signal: pointer.signal});
    };
    handle.addEventListener("pointerdown", pressed);
    return () => handle.removeEventListener("pointerdown", pressed);
  };

  // ---- the pane's layout ----

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  // The pane's width, the indexes' heights, which sections are closed, and
  // where each index is scrolled, kept from page to page. +lists+ are the
  // indexes' elements by section: files, classes, and methods.
  class PaneLayout {
    static key = "swill-doc-layout";

    constructor(pane, lists) {
      this.pane = pane;
      this.lists = lists;
      this.saved = {heights: {}, scroll: {}, closed: {}, ...stored.object(PaneLayout.key)};
    }

    save() {
      stored.set(PaneLayout.key, JSON.stringify(this.saved));
    }

    // ---- sizes ----

    applySizes() {
      const {width, heights} = this.saved;
      if (width) Object.assign(this.pane.style, {width: `${width}px`, maxWidth: "none"});
      for (const [section, height] of Object.entries(heights)) {
        Object.assign(this.lists[section].style, {height: `${height}px`, maxHeight: "none"});
      }
    }

    // The pane's right edge sets its width.
    dragsWidth(handle) {
      return draggable(handle, {
        start: () => this.pane.getBoundingClientRect().width,
        move: (width, dx) => {
          this.saved.width = Math.round(clamp(width + dx, 220, 640));
          this.applySizes();
        },
        end: () => this.save()
      });
    }

    // The heading below a shown index sets the index's height.
    dragsHeight(handle, section) {
      const list = this.lists[section];
      return draggable(handle, {
        start: () => list.checkVisibility() && list.getBoundingClientRect().height,
        move: (height, _dx, dy) => {
          this.saved.heights[section] = Math.round(Math.max(40, height + dy));
          this.applySizes();
        },
        end: () => this.save()
      });
    }

    // ---- sections and scrolling ----

    saveClosed(closed) {
      this.saved.closed = closed;
      this.save();
    }

    rememberScroll(section) {
      const list = this.lists[section];
      if (!list.checkVisibility()) return;
      this.saved.scroll[section] = list.scrollTop;
      this.save();
    }

    restoreScroll() {
      for (const [section, list] of Object.entries(this.lists)) {
        if (list.checkVisibility()) list.scrollTop = this.saved.scroll[section] ?? 0;
      }
    }
  }

  // ---- the navigator ----

  class DocNavigator extends Swill.Controller {
    static properties = {
      query: {default: ""},
      language: {default: "ruby"},
      internalOpen: {default: false},
      // The sections closed, by name.
      closed: {default: () => ({})}
    };
    static outlets = {fileList: {}, classList: {}, methodList: {}, fileResizer: {}, classResizer: {}, widthHandle: {}};
    static internalKey = "swill-doc-internal";

    get files() { return matching(files, this.query, "name"); }

    // Every class in Ruby; in JavaScript, the named classes, then the
    // implementation under its row.
    get classes() {
      if (this.language !== "javascript") return matching(classes, this.query, "search");
      const shown = spelled(matching(publicClasses, this.query, "search"), this.language);
      const internal = matching(internalClasses, this.query, "search");
      if (internal.length === 0) return shown;
      const open = this.internalOpen || this.isSearching();
      return [...shown, {group: true, label: "Implementation", open}, ...(open ? internal : [])];
    }

    get methods() { return spelled(matching(methods, this.query, "search"), this.language); }

    get filesOpen() { return !this.closed.files; }
    get classesOpen() { return !this.closed.classes; }
    get methodsOpen() { return !this.closed.methods; }

    // The lists, by section.
    indexes() {
      return {files: this.fileList, classes: this.classList, methods: this.methodList};
    }

    viewDidLoad() {
      this.cursor = -1;
      this.internalOpen = stored.get(DocNavigator.internalKey) === "open";
      this.language = currentLanguage();
      this.observeNotification("language_did_change", notification => {
        this.language = notification.userInfo;
      });
    }

    awakeFromDOM() {
      const lists = Object.fromEntries(Object.entries(this.indexes()).map(([section, list]) => [section, list.view.element]));
      const layout = new PaneLayout(this.view.element, lists);
      this.layout = layout;
      this.closed = layout.saved.closed;
      layout.applySizes();
      this.retain(layout.dragsWidth(this.widthHandle.element));
      this.retain(layout.dragsHeight(this.fileResizer.element, "files"));
      this.retain(layout.dragsHeight(this.classResizer.element, "classes"));
      for (const [section, list] of Object.entries(lists)) {
        this.retain(new Swill.Swell(list).listen("scroll", () => this.indexScrolled(section)));
      }
      this.restoreScroll();
      document.fonts.ready.then(() => this.restoreScroll());
    }

    isSearching() {
      return this.query.trim() !== "";
    }

    queryDidChange() {
      this.select(-1);
      requestAnimationFrame(() => this.restoreScroll());
    }

    // A filtered index scrolls on its own; the positions remembered are the
    // whole index's, and come back with it.
    indexScrolled(section) {
      if (!this.isSearching()) this.layout.rememberScroll(section);
    }

    restoreScroll() {
      if (!this.isSearching()) this.layout?.restoreScroll();
    }

    // ---- actions ----

    toggleFiles() { this.toggleSection("files"); }
    toggleClasses() { this.toggleSection("classes"); }
    toggleMethods() { this.toggleSection("methods"); }

    toggleSection(section) {
      this.closed = {...this.closed, [section]: !this.closed[section]};
      this.layout.saveClosed(this.closed);
      this.select(-1);
      this.restoreScroll();
    }

    toggleInternal() {
      this.internalOpen = !this.internalOpen;
      stored.set(DocNavigator.internalKey, this.internalOpen ? "open" : "closed");
    }

    // ---- moving through the results ----

    // Every result, in the order the open lists show them.
    results() {
      return Object.entries(this.indexes())
        .filter(([section]) => !this.closed[section])
        .flatMap(([, list]) => list.arrangedObjects.map((entry, index) => ({list, index, entry})));
    }

    // Selects the result at +position+ in its own list, and nothing in the
    // others; -1 selects nothing.
    select(position) {
      const chosen = this.results()[position];
      for (const list of Object.values(this.indexes())) {
        if (list !== chosen?.list) list.deselectAll();
      }
      if (chosen) chosen.list.selectIndexes([chosen.index]);
      this.cursor = chosen ? position : -1;
    }

    moveDown() { this.step(1); }
    moveUp() { this.step(-1); }

    step(by) {
      const last = this.results().length - 1;
      this.select(clamp(this.cursor + by, -1, last));
    }

    // The selected result, or else the first class, method, or file.
    chosenResult() {
      const results = this.results();
      const first = list => results.find(result => result.list === list);
      return (results[this.cursor] ?? first(this.classList) ?? first(this.methodList) ?? results[0])?.entry;
    }

    // Enter opens the chosen result, or opens or closes the implementation.
    insertNewline(event) {
      const chosen = this.chosenResult();
      if (!chosen) return super.insertNewline(event);
      if (chosen.group) this.toggleInternal();
      else window.location.href = chosen.href;
    }

    // Escape abandons the query and leaves the search; the application holds
    // the keyboard again.
    cancelOperation() {
      this.query = "";
      this.application().makeFirstResponder(null);
    }
  }

  // ---- the language switch ----

  // Ruby or JavaScript, for every page: the choice is the document's
  // data-language, which the stylesheet follows, and it is remembered.
  class LanguageSwitch extends Swill.Controller {
    static properties = {language: {default: "ruby"}};
    static key = "swill-doc-language";

    get ruby() { return this.language === "ruby"; }
    get javascript() { return this.language === "javascript"; }

    viewDidLoad() { this.language = currentLanguage(); }

    useRuby() { this.choose("ruby"); }
    useJavaScript() { this.choose("javascript"); }

    choose(language) {
      this.language = language;
      document.documentElement.dataset.language = language;
      stored.set(LanguageSwitch.key, language);
      Swill.NotificationCenter.default().post("language_did_change", this, language);
    }
  }

  // ---- the application ----

  // A field keeps the keys typed into it.
  const typing = target => target?.closest?.("input, textarea, select, [contenteditable]");

  // ~ anywhere outside a field moves to the search.
  class DocApplication extends Swill.Application {
    keyDown(event) {
      const navigator = this.controllers.find(controller => controller instanceof DocNavigator);
      if ((event.key === "`" || event.key === "~") && !typing(event.target) && navigator) {
        event.preventDefault();
        this.makeFirstResponder(navigator);
        return;
      }
      super.keyDown(event);
    }
  }

  Swill.register(DocNavigator);
  Swill.register(LanguageSwitch);
  Swill.register(DocApplication);
  Swill.start({application: DocApplication});
})();
