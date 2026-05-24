let firstResponder: Responder | null = null;

// The chain-top responder — Cocoa's NSWindow in the FR fallback. Set to
// the `Application` at boot (see `setChainTop`). On an incoming refusal
// or a `null` target, FR falls here rather than to `null`, exactly as
// Cocoa bottoms out at the window/app.
// TODO(per-window FR): when responder chains go per-window, the chain
// top becomes that window's responder and this module-global splits.
let chainTop: Responder | null = null;

/** Current first responder, or null. Read-only outside this module. */
export function currentFirstResponder(): Responder | null {
  return firstResponder;
}

/** Wire the chain-top fallback responder (the `Application`). Called once
 *  at boot. TODO(per-window FR): becomes per-window. */
export function setChainTop(r: Responder): void {
  chainTop = r;
}

/** The chain-top responder (the `Application`), or null pre-boot. The
 *  responder chain bottoms out here — a root controller's
 *  `nextResponder` is this. TODO(per-window FR): per-window. */
export function chainTopResponder(): Responder | null {
  return chainTop;
}

/**
 * Install a new first responder after DOM focus has shifted. Internal —
 * `syncFirstResponderFromFocus` uses it to record the FR the browser
 * already moved focus to. Prefer `makeFirstResponder`.
 */
export function _setFirstResponder(r: Responder | null): void {
  firstResponder = r;
}

/**
 * Cocoa `NSWindow.makeFirstResponder(_:)` — the single orchestrator for
 * changing the first responder. Verified against Apple's documented
 * contract:
 *
 * 1. `responder` already FR → `true`, send nothing.
 * 2. Send `resignFirstResponder(responder)` to the current FR. **Refusal
 *    aborts**: FR unchanged, return `false` (the caller restores DOM
 *    focus — that's a View concern, not this module's).
 * 3. Current FR resigned. `responder == null` → FR = chain-top, `true`.
 * 4. Send `becomeFirstResponder()` to `responder`. **Refusal does NOT
 *    abort and does NOT return false** — FR = chain-top, return `true`.
 * 5. Accepted → FR = `responder`, `true`.
 *
 * Does NOT pre-gate on `canBecomeFirstResponder` — per Apple that's the
 * caller's check. The outgoing/incoming asymmetry is deliberate: only an
 * outgoing resign-refusal aborts.
 */
export function makeFirstResponder(responder: Responder | null): boolean {
  if (responder === firstResponder) return true;            // 1
  const current = firstResponder;
  if (current && !current.resignFirstResponder(responder)) return false; // 2
  firstResponder = null;
  if (responder == null) {                                  // 3
    firstResponder = chainTop;
    return true;
  }
  if (responder.becomeFirstResponder()) {                   // 5
    firstResponder = responder;
    return true;
  }
  firstResponder = chainTop;                                // 4
  return true;
}

/**
 * Abstract base for anything that participates in the responder chain.
 * Cocoa NSResponder / UIResponder analog.
 *
 * Pure chain mechanics: first-responder state, event routing, and
 * target-action lookup. Nothing here knows about views, DOM, or
 * lifecycle — those live on `Controller`, which extends this.
 *
 * @remarks
 * A subclass must declare:
 *
 * - `get nextResponder()`: the next link in the chain (null at the root).
 *
 * It may override:
 *
 * - `canBecomeFirstResponder` / `canResignFirstResponder` (default: true).
 * - `becomeFirstResponder` / `resignFirstResponder` — pure protocol:
 *   accept/refuse + the notification + setup. The handshake + global FR
 *   live in `makeFirstResponder` (no `did*` hooks; Cocoa has none).
 * - Any of `keyDown` / `keyUp` / `cancelOperation` / `insertNewline` / `complete`.
 * - `performAction` for custom dispatch (rare).
 */
export abstract class Responder {
  /** Next link in the responder chain. Cocoa: -[NSResponder nextResponder].
   * Subclasses provide this; `Controller` derives it from View containment. */
  abstract get nextResponder(): Responder | null;

  /** Cocoa NSResponder predicates. Override to gate transitions declaratively;
   * the side-effecting `becomeFirstResponder`/`resignFirstResponder` consult
   * these before doing anything. */
  get canBecomeFirstResponder(): boolean { return true; }
  get canResignFirstResponder(): boolean { return true; }

  get isFirstResponder(): boolean { return firstResponder === this; }

  /**
   * Pure protocol (Cocoa `NSResponder.becomeFirstResponder()`): the
   * accept-or-refuse decision *and* the "about to become FR"
   * notification. Return `false` to refuse. Do setup here (focus,
   * etc.). Does NOT touch the global FR or run the handshake — that's
   * `makeFirstResponder`'s job. There is no separate `did*` hook;
   * `become`/`resign` ARE the notifications (Cocoa has none).
   */
  becomeFirstResponder(): boolean {
    return this.canBecomeFirstResponder;
  }

  /**
   * Pure protocol (Cocoa `NSResponder.resignFirstResponder()`). Return
   * `false` to refuse — `makeFirstResponder` then aborts the transition
   * and the outgoing responder stays FR. `next` is the proposed
   * incoming responder (null when focus is going nowhere); subclasses
   * inspect it to delegate, validate, or prompt before allowing.
   */
  resignFirstResponder(_next: Responder | null = null): boolean {
    return this.canResignFirstResponder;
  }

  // ---- event chain ----
  //
  // Default behavior matches Cocoa's NSResponder: keyDown routes well-known
  // keys to named methods (cancelOperation/insertNewline/complete); other
  // keys, and the named methods themselves, bubble up via nextResponder.

  keyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case "Escape": return this.cancelOperation(event);
      case "Enter":  return this.insertNewline(event);
      case "Tab":    return this.complete(event);
      default:       this.nextResponder?.keyDown(event);
    }
  }
  keyUp(event: KeyboardEvent): void { this.nextResponder?.keyUp(event); }
  cancelOperation(event: KeyboardEvent): void { this.nextResponder?.cancelOperation(event); }
  insertNewline(event: KeyboardEvent): void { this.nextResponder?.insertNewline(event); }
  complete(event: KeyboardEvent): void { this.nextResponder?.complete(event); }

  /** Walk the responder chain looking for a method with this name. Used by
   * target-action: `<button data-action="save">` starts at
   * `firstResponderFor(buttonElement)`, then walks up until something
   * handles it. */
  performAction(name: string, sender: unknown, event?: Event): boolean {
    let node: Responder | null = this;
    while (node) {
      const fn = (node as any)[name];
      if (typeof fn === "function") {
        fn.call(node, sender, event);
        return true;
      }
      node = node.nextResponder;
    }
    return false;
  }
}
