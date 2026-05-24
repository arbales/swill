type Handler = (userInfo: any) => void;

const handlers = new Map<string, Set<Handler>>();

/**
 * Tiny pub/sub. Cocoa NSNotificationCenter analog.
 *
 * @example
 * ```ts
 * Notifications.post("user.signedIn", { id: 42 });
 * const off = Notifications.observe("user.signedIn", (info) => { ... });
 * off(); // unsubscribe
 * ```
 */
export const Notifications = {
  post(name: string, userInfo: unknown = undefined): void {
    handlers.get(name)?.forEach((h) => h(userInfo));
  },
  /** Returns an unsubscribe function. */
  observe(name: string, handler: Handler): () => void {
    let set = handlers.get(name);
    if (!set) { set = new Set(); handlers.set(name, set); }
    set.add(handler);
    return () => { set!.delete(handler); };
  },
};
