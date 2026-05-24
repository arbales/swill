import type { Responder } from "../core/responder";
import { View } from "../core/view";

export interface ControlDelegate {
  controlShouldResignFirstResponder?(control: Control, next: Responder | null): boolean;
}

export abstract class Control extends View {
  delegate?: ControlDelegate;

  override resignFirstResponder(next: Responder | null = null): boolean {
    if (this.delegate?.controlShouldResignFirstResponder?.(this, next) === false) {
      return false;
    }
    return super.resignFirstResponder(next);
  }
}
