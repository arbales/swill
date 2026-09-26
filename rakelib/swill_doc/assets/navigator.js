// The left pane: a plain JavaScript Swill application on the UI build.
//
// Three Swill.Lists show the files, classes, and methods in search_index.js,
// each bound to a computed property that follows the query. Entries are
// ordinary links, so choosing one loads that page.
//
// Keys: ~ moves to the search; arrows move through the results, in the order
// they appear; Enter opens the selected result, or the first; Escape abandons
// the query and leaves the search.
//
// The pane's width and the first two indexes' heights can be dragged, and are
// remembered from page to page.
(() => {
  const root = document.documentElement.dataset.root ?? "";
  const index = globalThis.SwillDocIndex;
  const linked = entries => entries.map(entry => ({...entry, href: root + entry.url}));
  const files = linked(index.files);
  const classes = linked(index.classes);
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
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      begin();
      const move = moved => resize(moved.clientX - event.clientX, moved.clientY - event.clientY);
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        done();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    };
    handle.addEventListener("pointerdown", down);
    return () => handle.removeEventListener("pointerdown", down);
  };

  // A field keeps the keys typed into it.
  const typing = target => target?.closest?.("input, textarea, select, [contenteditable]");

  class DocNavigator extends Swill.Controller {
    static properties = {query: {default: ""}};
    static outlets = {fileList: {}, classList: {}, methodList: {}};

    get files() { return matching(files, this.query, "name"); }
    get classes() { return matching(classes, this.query, "name"); }
    get methods() { return matching(methods, this.query, "search"); }

    viewDidLoad() {
      this.cursor = -1;
      this.observe("query", () => this.select(-1));
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
          () => { start = list.getBoundingClientRect().height; },
          (_dx, dy) => {
            layout[name] = Math.round(Math.max(40, start + dy));
            apply();
          },
          () => storeLayout(layout)));
      }
    }

    // Every result, in the order the lists show them.
    results() {
      return [this.fileList, this.classList, this.methodList].flatMap(list =>
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
      const step = {ArrowDown: 1, ArrowUp: -1}[event.key];
      if (!step) return super.keyDown(event);
      event.preventDefault();
      const last = this.results().length - 1;
      this.select(Math.max(-1, Math.min(last, this.cursor + step)));
    }

    // Enter opens the selected result, or the first, preferring a class to a
    // method to a file.
    insertNewline(event) {
      const chosen = this.results()[this.cursor]?.entry ?? this.classes[0] ?? this.methods[0] ?? this.files[0];
      if (!chosen) return;
      event.preventDefault();
      window.location.href = chosen.href;
    }

    // Escape abandons the query and leaves the search; the application holds
    // the keyboard again.
    cancelOperation(event) {
      event.preventDefault();
      this.query = "";
      this.application().makeFirstResponder(null);
    }
  }

  // ~ anywhere outside a field moves to the search.
  class DocApplication extends Swill.Application {
    keyDown(event) {
      if (event.key === "~" && !typing(event.target)) {
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
  Swill.register(DocApplication);
  Swill.start({application: DocApplication});
})();
