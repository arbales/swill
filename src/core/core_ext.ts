// JavaScript could just have a reasonable String class. That'd be cute.
//
declare global {
  interface String {
    /** Convert to lowerCamelCase. Handles snake_case input by joining
     * segments with each non-first segment capitalized. Plain identifiers
     * just get the first character lowercased. */
    toLowerCamel(): string;

    /** Same conversion, then uppercase the first character. */
    toUpperCamel(): string;
  }
}

String.prototype.toLowerCamel = function (this: string): string {
  if (!this) return this as string;
  if (this.includes("_")) {
    return this.split("_")
      .map((part, i) => (i === 0 ? part.toLowerCase() : (part[0]?.toUpperCase() ?? "") + part.slice(1).toLowerCase()))
      .join("");
  }
  return this[0]!.toLowerCase() + this.slice(1);
};

String.prototype.toUpperCamel = function (this: string): string {
  const lc = this.toLowerCamel();
  if (!lc) return lc;
  return lc[0]!.toUpperCase() + lc.slice(1);
};

export {};
