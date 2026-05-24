import { observable, register } from "../core/decorators";
import { el } from "../core/dom";
import { Control } from "./control";

export interface CustomSelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

// Fully stylable Select alternative. Such a nasty thing.
//
//   <div klass="CustomSelect" bind="visibility"></div>
//
//   select.options = [{ value: "Members", icon: "globe", label: "Members" }];
@register
export class CustomSelect extends Control {
  @observable accessor options: CustomSelectOption[] = [];
  @observable accessor value: string = "";

  private button!: HTMLButtonElement;
  private buttonIconEl!: HTMLElement;
  private labelEl!: HTMLElement;
  private popup!: HTMLElement;
  private isOpen = false;
  private onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.element.contains(event.target as Node | null)) this.close();
  };

  constructor(el: HTMLElement) {
    super(el);
    this.installChrome();
    this.renderOptions();
    this.close(true);
  }

  optionsDidChange(): void {
    this.renderOptions();
  }

  valueDidChange(_prev: string, _next: string): void {
    this.syncButton();
    this.syncSelectedOption();
  }

  override cancelOperation(event: KeyboardEvent): void {
    if (!this.isOpen) return super.cancelOperation(event);
    event.preventDefault();
    this.close();
  }

  override keyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!this.isOpen) return;
        this.moveSelection(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        if (!this.isOpen) return;
        this.moveSelection(-1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        this.toggle();
        return;
      default:
        super.keyDown(event);
    }
  }

  private installChrome(): void {
    this.element.classList.add("custom-select");
    this.element.tabIndex = 0;
    this.element.setAttribute("role", "combobox");
    this.element.setAttribute("aria-haspopup", "listbox");
    this.element.innerHTML = "";

    this.buttonIconEl = el("span", {
      class: "custom-select-trigger-icon",
      ariaHidden: "true",
    });
    this.labelEl = el("span", { class: "custom-select-label" });
    this.button = el(
      "button",
      {
        type: "button",
        class: "custom-select-button",
        tabIndex: -1,
        onclick: (event: MouseEvent) => {
          if (event.detail === 0) return;
          this.toggle();
        },
      },
      [this.buttonIconEl, this.labelEl],
    );
    this.element.addEventListener("focusout", (event) => {
      const next = event.relatedTarget as Node | null;
      if (!next || !this.element.contains(next)) this.close();
    });

    this.popup = el("div", { class: "custom-select-popup", role: "listbox" });

    this.element.append(this.button, this.popup);
  }

  private renderOptions(): void {
    this.popup.innerHTML = "";
    for (const option of this.allOptions()) {
      this.popup.appendChild(this.optionElement(option));
    }
    this.syncButton();
    this.syncSelectedOption();
  }

  private optionElement(option: CustomSelectOption): HTMLButtonElement {
    return el(
      "button",
      {
        type: "button",
        class: "custom-select-option",
        role: "option",
        tabIndex: -1,
        dataset: { value: option.value },
        onclick: () => {
          this.setValueFromUser(option.value);
          this.close();
        },
      },
      [
        option.icon
          ? el("span", {
              class: `custom-select-icon icon-${option.icon}`,
              ariaHidden: "true",
            })
          : null,
        el("span", { class: "custom-select-option-text" }, [
          el("span", { class: "custom-select-option-label" }, option.label),
          option.description ? el("span", { class: "custom-select-option-description" }, option.description) : null,
        ]),
      ],
    );
  }

  private allOptions(): CustomSelectOption[] {
    return this.options;
  }

  private selectedOption(): CustomSelectOption | null {
    return this.allOptions().find((option) => option.value === this.value) ?? null;
  }

  private syncButton(): void {
    const option = this.selectedOption();
    this.buttonIconEl.className = option?.icon
      ? `custom-select-trigger-icon icon-${option.icon}`
      : "custom-select-trigger-icon";
    this.buttonIconEl.hidden = !option?.icon;
    this.labelEl.textContent = option?.label ?? "";
  }

  private syncSelectedOption(): void {
    for (const row of Array.from(this.popup.querySelectorAll<HTMLElement>("[role='option']"))) {
      const selected = row.dataset.value === this.value;
      row.setAttribute("aria-selected", selected ? "true" : "false");
    }
  }

  private toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.element.classList.add("open");
    this.element.setAttribute("aria-expanded", "true");
    this.button.setAttribute("aria-expanded", "true");
    this.popup.hidden = false;
    document.addEventListener("pointerdown", this.onDocumentPointerDown);
  }

  private close(force = false): void {
    if (!force && !this.isOpen) return;
    this.isOpen = false;
    this.element.classList.remove("open");
    this.element.setAttribute("aria-expanded", "false");
    this.button.setAttribute("aria-expanded", "false");
    this.popup.hidden = true;
    document.removeEventListener("pointerdown", this.onDocumentPointerDown);
  }

  private moveSelection(delta: number): void {
    const options = this.allOptions();
    if (options.length === 0) return;
    const current = options.findIndex((option) => option.value === this.value);
    const next = current < 0 ? 0 : (current + delta + options.length) % options.length;
    this.setValueFromUser(options[next]!.value);
  }

  private setValueFromUser(value: string): void {
    if (this.value === value) return;
    this.value = value;
    this.element.dispatchEvent(new Event("input", { bubbles: true }));
    this.element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
