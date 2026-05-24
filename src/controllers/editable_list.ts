import { wireSubtree } from "../core/awakening";
import { observable } from "../core/decorators";
import { makeFirstResponder } from "../core/responder";
import { controllerFor } from "../core/view";
import { InlineEditor } from "./editor";
import { SortableList } from "./sortable_list";
import { Model, type ModelClass } from "../model/model";

/** List + edit lifecycle. At most one editor exists at a time (NSWindow
 *  fieldEditor pattern). The draft lives on the list as `editedObject`;
 *  the editor's `representedObject` tracks it via `bind()`. See demo.html
 *  for the `<template for="editor">` markup shape. */
export class EditableList<T> extends SortableList<T> {
  @observable accessor editedObject: T | null = null;

  private editor: InlineEditor<T> | null = null;
  private editingIndex: number | null = null;

  protected editorTemplateElement(): HTMLTemplateElement | null {
    return this.view.element.querySelector(':scope > template[for="editor"]');
  }

  // Default activation = open the editor for the selected row.
  override activateSelection(): void {
    const idx = this.selectedIndexes[0];
    if (idx == null) return;
    this.beginEditing(idx);
  }

  isEditing(): boolean {
    return this.editor !== null;
  }

  beginEditing(index: number): void {
    if (this.editor) void this.endEditing(true);

    // Editable copy that bindings can mutate without leaking into the
    // list's model until commit (Model.draft() for Models, spread otherwise).
    const original = this.arrangedObjects[index];
    let editedObject: T | null;
    if (original instanceof Model) {
      editedObject = original.draft() as T;
    } else if (original && typeof original === "object") {
      editedObject = { ...(original as object) } as T;
    } else {
      editedObject = (original ?? null) as T | null;
    }
    this.openEditor(index, editedObject);
  }

  // Mount the editor view. Used for fresh edits AND for re-entering edit
  // mode after a save failure (the same draft is preserved).
  private openEditor(index: number, editedObject: T | null): void {
    const tpl = this.editorTemplateElement();
    if (!tpl) {
      console.warn(`[Swill] ${this.constructor.name}: no <template for="editor"> inside the list view`);
      return;
    }
    const node = tpl.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
    if (!node) return;

    const rowEl = this.rowElements()[index];
    if (!rowEl) return;

    this.editedObject = editedObject;

    rowEl.classList.add("being-edited");
    rowEl.after(node);
    wireSubtree(node);

    const editor = controllerFor(node) as InlineEditor<T>;
    editor.bind("representedObject", this, "editedObject");
    makeFirstResponder(editor);

    this.editor = editor;
    this.editingIndex = index;
  }

  /** Returns false only when a commit was refused (validation or save). */
  async endEditing(commit: boolean): Promise<boolean> {
    const editor = this.editor;
    const idx = this.editingIndex;
    if (!editor || idx == null) return true;

    // Validate BEFORE teardown so a rejection can keep the editor open.
    let editedObject: T | null;
    if (commit) {
      editedObject = editor.commit();
      if (editedObject instanceof Model) {
        const error = editedObject.validate();
        if (error) {
          this.editingDidFailValidation(error);
          return false;
        }
      }
    } else {
      editor.discard();
      editedObject = null;
    }

    // Destroy the editor view BEFORE the save await so it doesn't linger
    // during the round trip.
    this.editor = null;
    this.editingIndex = null;
    this.editedObject = null;
    editor._destroyView();

    if (editedObject == null) {
      const row = this.rowElements()[idx];
      row?.classList.remove("being-edited");
      makeFirstResponder(this);
      return true;
    }

    // Model drafts round-trip through save → pooled instance; plain
    // copies go in directly.
    let final: T;
    if (editedObject instanceof Model) {
      try {
        await editedObject.save();
      } catch (err) {
        // Re-mount the editor with the same draft so the user can retry.
        this.editingDidFailSave(err as Error);
        this.openEditor(idx, editedObject as T);
        return false;
      }
      const ctor = editedObject.constructor as ModelClass<Model>;
      final = (editedObject.id != null ? (ctor.store?.get(editedObject.id) ?? editedObject) : editedObject) as T;
    } else {
      final = editedObject;
    }

    const original = this.arrangedObjects[idx];
    if (original === undefined) return true;
    const sourceIndex = this.representedObject.indexOf(original);
    const arr = [...this.representedObject];
    if (sourceIndex >= 0) arr[sourceIndex] = final;
    this.representedObject = arr; // → renderAll() + clears selection
    this.selectedObject = final;
    makeFirstResponder(this);
    return true;
  }

  /** NSEditor `commitEditing:` query. Call before any action that can't
   *  proceed past in-progress edits. */
  async commitEditingIfNeeded(): Promise<boolean> {
    if (!this.editor) return true;
    return this.endEditing(true);
  }

  /** Default: prompt, validate, commit. Return false to refuse the focus
   *  transition (DOM focus snaps back to the editor). */
  protected editorShouldEndEditing(editor: InlineEditor<T>): boolean {
    const obj = editor.commit();
    if (!this.editedObjectHasChanges(obj)) {
      void this.endEditing(false);
      return true;
    }

    if (!window.confirm("Save changes?")) return false;

    if (obj instanceof Model) {
      const error = obj.validate();
      if (error) {
        this.editingDidFailValidation(error);
        return false;
      }
    }
    void this.endEditing(true);
    return true;
  }

  protected editedObjectHasChanges(obj: T | null): boolean {
    if (obj instanceof Model) return obj.isDirty;
    return obj != null;
  }

  /** Override to surface validation errors in the UI. */
  protected editingDidFailValidation(error: Error): void {
    console.warn(`[edit] ${this.constructor.name}: ${error.message}`);
  }

  /** Override to surface save errors. Editor has been re-mounted with
   *  the draft by the time this fires. */
  protected editingDidFailSave(error: Error): void {
    console.error(`[edit] ${this.constructor.name}: save failed`, error);
  }

  override cancelOperation(event: KeyboardEvent): void {
    if (this.editor) {
      void this.endEditing(false);
      return;
    }
    super.cancelOperation(event);
  }

  // The editor view lives in the rows container while editing; exclude it.
  protected override isRowElement(el: HTMLElement): boolean {
    return super.isRowElement(el) && el !== this.editor?.view.element;
  }
}
