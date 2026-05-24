import type { BindingAdapter } from "../decorators";

interface IdentifiableObject {
  id: string | number | null;
}

export interface SelectedObjectIdBindingOptions {
  collection?: string;
  selectedObject?: string;
  dependencies?: readonly string[];
}

export function selectedObjectIdBinding<This extends object>(
  options: SelectedObjectIdBindingOptions = {},
): BindingAdapter<This, string | null> {
  const collectionKey = options.collection ?? "representedObject";
  const selectedObjectKey = options.selectedObject ?? "selectedObject";
  return {
    dependencies: options.dependencies ?? [collectionKey, selectedObjectKey],

    get(this: This, pending) {
      const selected = (this as any)[selectedObjectKey] as IdentifiableObject | null | undefined;
      const id = selected?.id;
      return id == null ? pending : String(id);
    },

    set(this: This, id) {
      if (id == null || id === "") {
        (this as any)[selectedObjectKey] = null;
        return true;
      }

      const collection = (this as any)[collectionKey] as unknown;
      if (!Array.isArray(collection)) return false;

      const match = collection.find((item): item is IdentifiableObject => {
        const candidate = item as Partial<IdentifiableObject> | null | undefined;
        return candidate?.id != null && String(candidate.id) === id;
      });
      if (!match) return false;

      (this as any)[selectedObjectKey] = match;
      return true;
    },
  };
}
