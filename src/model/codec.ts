import type { Model, ModelClass } from "./model";

export interface ModelCodec {
  parseOne<T extends Model>(cls: ModelClass<T>, payload: unknown): T | null;
  parseMany<T extends Model>(cls: ModelClass<T>, payload: unknown): T[];
  serialize?(model: Model, options: { dirtyOnly: boolean }): unknown;
}

export function codecFor<T extends Model>(cls: ModelClass<T>): ModelCodec {
  return cls.codec ?? jsonApiCodec();
}

function jsonApiCodec(): ModelCodec {
  return requireJsonApiCodec();
}

let cachedJsonApiCodec: ModelCodec | null = null;

function requireJsonApiCodec(): ModelCodec {
  if (cachedJsonApiCodec) return cachedJsonApiCodec;
  throw new Error("jsonApiCodec has not been installed");
}

export function installDefaultCodec(codec: ModelCodec): void {
  cachedJsonApiCodec = codec;
}
