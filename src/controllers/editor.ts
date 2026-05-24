import type { Control, ControlDelegate } from "../controls/control";
import { observable, register } from "../core/decorators";
import type { Responder } from "../core/responder";
import { Controller, View } from "../core/view";

// `Editor<T>` is the NSEditor analog (owns representedObject + commit/discard).
// `InlineEditor<T>` adds the loan pattern used by `EditableList`.

/** Implemented by hosts that loan editors in and out. */
export interface EditorHost<T> {
  endEditing(commit: boolean): Promise<boolean>;
  /** NSEditor `commitEditing:` query. */
  commitEditingIfNeeded(): Promise<boolean>;
  /** NSControl `controlTextShouldEndEditing:` analog. */
  editorShouldEndEditing(editor: InlineEditor<T>): boolean;
}

/** Base editor: owns `representedObject`, exposes commit/discard, routes
 *  Enter→commit and Esc→discard. */
@register
export class Editor<T> extends Controller {
  @observable accessor representedObject: T | null = null;

  override bindingRoot(): string {
    return "representedObject";
  }

  /** Default returns `representedObject` as-is — two-way bindings have
   *  already mutated it. Override for coercion. */
  commit(): T | null {
    return this.representedObject;
  }

  discard(): void {}

  override insertNewline(_event: KeyboardEvent): void {
    this.commit();
  }
  override cancelOperation(_event: KeyboardEvent): void {
    this.discard();
  }
}

/** NSWindow.fieldEditor analog. One editor loaned to whichever item is
 *  being edited, then released. Driven by `EditableList`. */
export class InlineEditor<T> extends Editor<T> implements ControlDelegate {
  override get parent(): Controller & EditorHost<T> {
    return super.parent as Controller & EditorHost<T>;
  }

  override insertNewline(_event: KeyboardEvent): void {
    this.parent.endEditing(true);
  }

  override cancelOperation(_event: KeyboardEvent): void {
    this.parent.endEditing(false);
  }

  override resignFirstResponder(next: Responder | null = null): boolean {
    if (!this.shouldAllowResignTo(next)) return false;
    return super.resignFirstResponder(next);
  }

  /** NSControlTextEditingDelegate analog. Sub-controls set us as their
   *  delegate (see `MovieEditor.awakeFromDOM`). */
  controlShouldResignFirstResponder(_control: Control, next: Responder | null): boolean {
    return this.shouldAllowResignTo(next);
  }

  // Internal navigation (focus moving within the editor's subtree —
  // including to a sub-control View, not just a Controller) is allowed
  // silently. Otherwise ask the host. No host = already torn down.
  private shouldAllowResignTo(next: Responder | null): boolean {
    const nextEl =
      next instanceof Controller ? next.view.element
      : next instanceof View ? next.element
      : null;
    if (nextEl && this.view.element.contains(nextEl)) return true;
    const host = super.parent as unknown as (Controller & EditorHost<T>) | null;
    if (!host) return true;
    return host.editorShouldEndEditing(this);
  }
}
