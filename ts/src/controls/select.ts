import { observable, register } from "../core/decorators";
import { Control } from "./control";

// Wraps a `<select>`. Options present in the markup at adopt time are
// preserved as a prefix; programmatic `options` append after them.
@register
export class Select extends Control {
  @observable accessor options: string[] = [];
  @observable accessor value: string = "";

  private templateOptionCount = 0;
  private onChange = (): void => { this.value = this.selectEl.value; };

  constructor(el: HTMLElement) {
    super(el);
    this.templateOptionCount = this.selectEl.options.length;
    this.selectEl.addEventListener("change", this.onChange);
  }

  optionsDidChange(_prev: string[], next: string[]): void {
    const sel = this.selectEl;
    while (sel.options.length > this.templateOptionCount) {
      sel.remove(this.templateOptionCount);
    }
    for (const v of next) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    }
    if (this.value && Array.from(sel.options).some((o) => o.value === this.value)) {
      sel.value = this.value;
    }
  }

  valueDidChange(_prev: string, next: string): void {
    if (this.selectEl.value !== next) this.selectEl.value = next;
  }

  private get selectEl(): HTMLSelectElement {
    return this.element as HTMLSelectElement;
  }
}
