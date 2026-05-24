import { registerClass, type RegisteredClass } from "./registry";

const SYMBOL_METADATA: symbol =
  (Symbol as unknown as { metadata?: symbol }).metadata ?? Symbol.for("Symbol.metadata");

type OutletOptions = { optional?: boolean };
type OutletContext = {
  name: string | symbol;
  metadata: object | null | undefined;
};

interface OutletMeta {
  outlets?: Set<string>;
  optionalOutlets?: Set<string>;
}

function metaFor(context: { metadata: object | null | undefined }): OutletMeta {
  return context.metadata as unknown as OutletMeta;
}

function ensureOwnSet(meta: OutletMeta, key: "outlets" | "optionalOutlets"): Set<string> {
  if (!Object.prototype.hasOwnProperty.call(meta, key)) {
    meta[key] = new Set(meta[key] ?? []);
  }
  return meta[key]!;
}

function classMeta(ctor: unknown): OutletMeta | undefined {
  return (ctor as any)?.[SYMBOL_METADATA] as OutletMeta | undefined;
}

function outletField(context: OutletContext, options: OutletOptions): void {
  const meta = metaFor(context);
  const name = String(context.name);
  ensureOwnSet(meta, "outlets").add(name);
  if (options.optional) ensureOwnSet(meta, "optionalOutlets").add(name);
}

/**
 * Register a class for runtime string lookup. The class's role is
 * determined elsewhere: Controller subclasses are usable with
 * `controller="..."`, View subclasses with `klass="..."`, and Model
 * subclasses by their static `type`.
 */
export function register<T extends RegisteredClass>(value: T, context: ClassDecoratorContext<T>): T;
export function register(name: string): <T extends RegisteredClass>(value: T, context: ClassDecoratorContext<T>) => T;
export function register(...args: any[]): any {
  if (args.length === 2 && typeof args[0] === "function") {
    const [ctor, context] = args as [RegisteredClass, ClassDecoratorContext];
    registerClass(String(context.name ?? ctor.name), ctor);
    return ctor;
  }
  const explicitName = args[0] as string;
  return function <T extends RegisteredClass>(ctor: T, _context: ClassDecoratorContext<T>): T {
    registerClass(explicitName, ctor);
    return ctor;
  };
}

/**
 * Record a field as a child-controller binding that `connectOutlets`
 * will fill in between `viewDidLoad` and `awakeFromDOM`.
 */
export function outlet(...args: any[]): any {
  if (args.length === 2 && args[0] === undefined) {
    return outletField(args[1], {});
  }
  const options = (args[0] ?? {}) as OutletOptions;
  return function (_target: undefined, context: OutletContext): void {
    outletField(context, options);
  };
}

export function outletNamesOf(instance: object): readonly string[] {
  const meta = classMeta(instance.constructor);
  return meta?.outlets ? [...meta.outlets] : [];
}

export function isOptionalOutlet(instance: object, name: string): boolean {
  const meta = classMeta(instance.constructor);
  return meta?.optionalOutlets?.has(name) ?? false;
}
