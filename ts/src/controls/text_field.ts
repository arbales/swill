import { observable } from "../core/decorators";
import { Control } from "./control";

// NSTextField analog. Wraps an `<input>` (or an element containing one).
// Two-way: `input` event → `value`; assigning `value` writes the DOM.
// Subclass with `@register` to expose under `klass="…"`.
export class TextField extends Control {
  @observable accessor value: string = "";

  constructor(el: HTMLElement) {
    super(el);
    const input = this.inputElement;
    if (input) {
      if (input.value !== this.value) this.value = input.value;
      input.addEventListener("input", this.onInput);
    }
  }

  protected get inputElement(): HTMLInputElement | null {
    const el = this.element;
    if (el instanceof HTMLInputElement) return el;
    return el.querySelector("input");
  }

  private onInput = (e: Event): void => {
    const t = e.target as HTMLInputElement;
    if (t === this.inputElement && t.value !== this.value) this.value = t.value;
  };

  valueDidChange(_prev: string, next: string): void {
    const input = this.inputElement;
    if (input && input.value !== next) input.value = next;
  }
}
