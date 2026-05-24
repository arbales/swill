// Pure object-to-object bindings — no DOM. The DOM-side
// (`bind="path"` markup) layers on top in view_bindings.ts.

/** Walk segments from `root`. Undefined if any intermediate is nullish. */
export function readPath(root: any, segments: readonly string[]): unknown {
  let cur: any = root;
  for (const s of segments) cur = cur?.[s];
  return cur;
}

/** Assign at the end of the path. No-op when any intermediate is nullish. */
export function writePath(
  root: any,
  segments: readonly string[],
  value: unknown,
): void {
  if (segments.length === 0) return;
  let cur: any = root;
  for (let i = 0; i < segments.length - 1; i++) {
    cur = cur?.[segments[i]!];
    if (cur == null) return;
  }
  cur[segments[segments.length - 1]!] = value;
}

/**
 * Subscribe to changes along an N-segment path. Each segment's
 * reassignment fires `onChange` and re-hooks downstream segments. The
 * disposer flips a `disposed` flag the installed wraps consult; stale
 * wraps on prior owners stay in place but no-op (identity-guarded).
 *
 * Works on any object using the `${name}DidChange` convention
 * (`@observable`, `@attr`, `@computed`, `@binding`, `@hasMany`).
 */
export function observePath(
  root: any,
  segments: readonly string[],
  onChange: () => void,
): () => void {
  if (segments.length === 0) return () => {};

  let disposed = false;
  const activeOwners: any[] = new Array(segments.length).fill(null);

  const rehookFromLevel = (startLevel: number): void => {
    let owner: any = root;
    for (let i = 0; i < startLevel; i++) {
      if (owner == null) return;
      owner = owner[segments[i]!];
    }
    for (let i = startLevel; i < segments.length; i++) {
      if (owner == null) {
        for (let j = i; j < segments.length; j++) activeOwners[j] = null;
        return;
      }
      const level = i;
      const currentOwner = owner;
      if (activeOwners[level] !== currentOwner) {
        activeOwners[level] = currentOwner;
        const cbName = `${segments[level]!}DidChange`;
        const orig = currentOwner[cbName];
        currentOwner[cbName] = function (this: any, prev: any, next: any) {
          if (!disposed && activeOwners[level] === currentOwner) {
            onChange();
            rehookFromLevel(level + 1);
          }
          if (typeof orig === "function") orig.call(this, prev, next);
        };
      }
      owner = currentOwner[segments[level]!];
    }
  };

  rehookFromLevel(0);
  return () => { disposed = true; };
}

export interface BindOptions {
  /** Reserved for future NSValueTransformer-style value transforms. */
  transform?: string;
}

/** target → (targetKey → disposer) for every active binding. */
const bindings = new WeakMap<object, Map<string, () => void>>();

/** NSKeyValueBinding shape: keep `target[targetKey]` in sync with
 *  `source.sourcePath`. One-way (source → target). Re-binding the same
 *  key replaces. */
export function bind(
  target: any,
  targetKey: string,
  source: any,
  sourcePath: string,
  _options: BindOptions = {},
): void {
  unbind(target, targetKey);
  const segments = sourcePath.split(".");
  const sync = (): void => {
    target[targetKey] = readPath(source, segments);
  };
  sync();
  const disposer = observePath(source, segments, sync);
  let perTarget = bindings.get(target);
  if (!perTarget) { perTarget = new Map(); bindings.set(target, perTarget); }
  perTarget.set(targetKey, disposer);
}

export function unbind(target: object, targetKey: string): void {
  const perTarget = bindings.get(target);
  const disposer = perTarget?.get(targetKey);
  if (!disposer) return;
  disposer();
  perTarget!.delete(targetKey);
}

/** Tear down every binding on `target`. Called by the framework on detach. */
export function unbindAll(target: object): void {
  const perTarget = bindings.get(target);
  if (!perTarget) return;
  for (const disposer of perTarget.values()) disposer();
  bindings.delete(target);
}
