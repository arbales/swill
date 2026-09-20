import { getTransformer } from "../bindings";

type Mapping = {
  attribute: string;
  property: string;
  transform?: string;
  value?: unknown;
};

const SYMBOL_METADATA: symbol =
  (Symbol as unknown as { metadata?: symbol }).metadata ?? Symbol.for("Symbol.metadata");

type MappingMeta = { htmlAttributes?: Mapping[] };

const classMeta = (ctor: unknown): MappingMeta | undefined =>
  (ctor as any)?.[SYMBOL_METADATA] as MappingMeta | undefined;

export function htmlAttribute(
  attribute: string,
  options: { transform?: string; value?: unknown } = {},
) {
  return function (
    _target: undefined,
    context: ClassFieldDecoratorContext<object, unknown>,
  ): void {
    const meta = context.metadata as MappingMeta;
    if (!Object.prototype.hasOwnProperty.call(meta, "htmlAttributes")) {
      meta.htmlAttributes = [...(meta.htmlAttributes ?? [])];
    }
    meta.htmlAttributes!.push({ attribute, property: String(context.name), ...options });
  };
}

export function applyAttributeMappings(instance: object, element: HTMLElement): void {
  for (const mapping of mappingsFor(instance)) {
    if (!element.hasAttribute(mapping.attribute)) continue;
    const raw = element.getAttribute(mapping.attribute);
    (instance as any)[mapping.property] =
      "value" in mapping
        ? mapping.value
        : getTransformer(mapping.transform ?? "string").parse(raw ?? "true");
  }
}

function mappingsFor(instance: object): Mapping[] {
  const out: Mapping[] = [];
  let proto = Object.getPrototypeOf(instance) as object | null;
  while (proto && proto !== Object.prototype) {
    out.unshift(...(classMeta((proto as any).constructor)?.htmlAttributes ?? []));
    proto = Object.getPrototypeOf(proto);
  }
  return out;
}
