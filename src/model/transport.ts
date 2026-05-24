import type { Model, ModelClass } from "./model";
import { codecFor, type ModelCodec } from "./codec";
import "./jsonapi";
import type { JsonApiDoc } from "./jsonapi";
import type { ModelId } from "./store";

// HTTP transport. Every `Class.find` / `.findAll` and `instance.save` /
// `.delete` flows through the functions here. One module-level `config`
// carries `baseUrl` and headers; each model class's codec owns parsing
// and serialization. JSON:API is the default codec.

export const config = {
  /** Prefix prepended to every model class's `url`. */
  baseUrl: "",
  /** Headers sent with every request. */
  headers: {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  } as Record<string, string>,
};

async function request(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const init: RequestInit = { method, headers: { ...config.headers, ...headers } };
  if (body === undefined) delete (init.headers as Record<string, string>)["Content-Type"];
  if (body instanceof URLSearchParams) {
    init.body = body.toString();
    (init.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(requestUrl(url), init);
  if (!res.ok) {
    throw new Error(`${method} ${url} → ${res.status}`);
  }
  return res;
}

function requestUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : config.baseUrl + url;
}

async function readJson(res: Response): Promise<unknown> {
  if (res.status === 204) return { data: null };
  return await res.json();
}

export async function requestJson(
  method: string,
  url: string,
  body?: unknown,
): Promise<JsonApiDoc> {
  const res = await request(method, url, body);
  return (await readJson(res)) as JsonApiDoc;
}

export async function requestFormJson(
  method: string,
  url: string,
  body: Record<string, string | number | boolean | null | undefined>,
): Promise<JsonApiDoc> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value != null) params.set(key, String(value));
  }
  const res = await request(method, url, params);
  return (await readJson(res)) as JsonApiDoc;
}

export async function fetchOne<T extends Model>(
  cls: ModelClass<T>,
  id: ModelId,
  params: URLSearchParams = new URLSearchParams(),
): Promise<T> {
  const qs = params.toString();
  const url = `${cls.url}/${encodeURIComponent(String(id))}${qs ? `?${qs}` : ""}`;
  return fetchOneFrom(cls, url);
}

export async function fetchOneFrom<T extends Model>(
  cls: ModelClass<T>,
  url: string,
  codec: ModelCodec = codecFor(cls),
): Promise<T> {
  const res = await request("GET", url);
  const payload = await readJson(res);
  const result = codec.parseOne(cls, payload);
  if (result == null) {
    throw new Error(`expected single resource at ${url}`);
  }
  return result;
}

export async function fetchAll<T extends Model>(
  cls: ModelClass<T>,
  params: URLSearchParams = new URLSearchParams(),
): Promise<T[]> {
  return fetchAllFrom(cls, cls.url, params);
}

export async function fetchAllFrom<T extends Model>(
  cls: ModelClass<T>,
  url: string,
  params: URLSearchParams = new URLSearchParams(),
  codec: ModelCodec = codecFor(cls),
): Promise<T[]> {
  const qs = params.toString();
  const requestUrl = `${url}${qs ? `?${qs}` : ""}`;
  const res = await request("GET", requestUrl);
  const payload = await readJson(res);
  return codec.parseMany(cls, payload);
}

export async function updateOne<T extends Model>(instance: T): Promise<T> {
  if (instance.id == null) throw new Error("updateOne requires an id");
  const ctor = instance.constructor as ModelClass<T>;
  const url = `${ctor.url}/${encodeURIComponent(String(instance.id))}`;
  const codec = codecFor(ctor);
  const body = serializeWith(codec, instance, { dirtyOnly: true });
  const res = await request("PATCH", url, body);
  const payload = await readJson(res);
  const result = codec.parseOne(ctor, payload);
  if (result == null) {
    throw new Error(`expected single resource from PATCH ${url}`);
  }
  return result;
}

export async function createOne<T extends Model>(instance: T): Promise<T> {
  const ctor = instance.constructor as ModelClass<T>;
  const url = ctor.url;
  const codec = codecFor(ctor);
  const body = serializeWith(codec, instance, { dirtyOnly: false });
  const res = await request("POST", url, body);
  const payload = await readJson(res);
  const result = codec.parseOne(ctor, payload);
  if (result == null) {
    throw new Error(`expected single resource from POST ${url}`);
  }
  return result;
}

export async function deleteOne<T extends Model>(instance: T): Promise<void> {
  if (instance.id == null) return;
  const ctor = instance.constructor as ModelClass<T>;
  const url = `${ctor.url}/${encodeURIComponent(String(instance.id))}`;
  await request("DELETE", url);
}

function serializeWith(
  codec: ModelCodec,
  instance: Model,
  options: { dirtyOnly: boolean },
): unknown {
  if (!codec.serialize) {
    throw new Error(`${instance.constructor.name} codec does not support serialization`);
  }
  return codec.serialize(instance, options);
}
