// Ruby call-shape carriers and binding for methods JavaScript cannot express
// directly. Fixed positional methods never pass through this module.
const KEYWORDS = Symbol("Swill keywords");
const BLOCK = Symbol("Swill block");
const OMITTED = Object.freeze({});

/**
 * Returns a carrier for the keyword arguments `value`, which a method compiled
 * with keyword or optional parameters receives as keywords rather than as a
 * hash.
 *
 * @param {object} value The keywords, by name.
 * @returns {object} The carrier.
 */
export function keywordArguments(value) {
  return {[KEYWORDS]: true, value};
}

/**
 * Returns a carrier for the block `value`, for a method compiled with a block
 * parameter.
 *
 * @param {Function} value
 * @returns {object} The carrier.
 */
export function blockArgument(value) {
  return {[BLOCK]: true, value};
}

/**
 * Returns the marker an optional parameter holds when its argument was
 * omitted, which distinguishes an omitted argument from nil.
 *
 * @returns {object}
 */
export function omittedArgument() {
  return OMITTED;
}

/**
 * Returns whether `value` is the marker of an omitted argument.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isOmittedArgument(value) {
  return value === OMITTED;
}

export function isKeywordArguments(value) {
  return value != null && value[KEYWORDS] === true;
}

export function isBlockArgument(value) {
  return value != null && value[BLOCK] === true;
}

export function positionalArgumentCount(values) {
  let count = values.length;
  if (count > 0 && isBlockArgument(values[count - 1])) count -= 1;
  if (count > 0 && isKeywordArguments(values[count - 1])) count -= 1;
  return count;
}

/**
 * Returns the value of each parameter of `signature`, by name, bound from
 * `values` as Ruby binds a call's arguments: required parameters before and
 * after the optional and rest parameters, optional parameters from the left,
 * keywords by name, and the block. An omitted optional parameter holds
 * `omittedArgument()`.
 *
 * @param {Array} values The arguments, carriers included.
 * @param {object} signature The method's parameters: `positional`,
 *   `keywords`, `keywordRest`, and `block`.
 * @returns {object} Each parameter's value, by name; an omitted one holds
 *   `omittedArgument()`.
 * @throws {Error} `wrong number of arguments`, `missing keyword`, or
 *   `unknown keyword`, with Ruby's wording.
 */
export function bindArguments(values, signature) {
  const supplied = values.slice();
  const blockCarrier = isBlockArgument(supplied.at(-1)) ? supplied.pop() : null;
  const keywordCarrier = isKeywordArguments(supplied.at(-1)) ? supplied.pop() : null;
  const keywords = keywordCarrier?.value ?? {};
  const bound = Object.create(null);

  const positional = signature.positional;
  const restIndex = positional.findIndex(parameter => parameter.kind === "rest");
  const optionalIndexes = positional.flatMap((parameter, index) => parameter.kind === "opt" ? [index] : []);
  const required = positional.length - optionalIndexes.length - (restIndex >= 0 ? 1 : 0);
  const maximum = restIndex >= 0 ? Infinity : positional.length;
  if (supplied.length < required || supplied.length > maximum) {
    throw new Error(`wrong number of arguments (given ${supplied.length}, expected ${required}${maximum === Infinity ? "+" : required === maximum ? "" : `..${maximum}`})`);
  }

  const beforeRest = restIndex >= 0 ? positional.slice(0, restIndex) : positional;
  const afterRest = restIndex >= 0 ? positional.slice(restIndex + 1) : [];
  const firstOptional = beforeRest.findIndex(parameter => parameter.kind === "opt");
  const prefix = firstOptional >= 0 ? beforeRest.slice(0, firstOptional) : beforeRest;
  const tail = firstOptional >= 0 ? beforeRest.slice(firstOptional) : [];
  const optionals = tail.filter(parameter => parameter.kind === "opt");
  const post = [...tail.filter(parameter => parameter.kind === "req"), ...afterRest];
  let front = 0;
  let back = supplied.length;
  for (const parameter of prefix) bound[parameter.name] = supplied[front++];
  for (let index = post.length - 1; index >= 0; index -= 1) bound[post[index].name] = supplied[--back];
  for (const parameter of optionals) {
    bound[parameter.name] = front < back ? supplied[front++] : OMITTED;
  }
  if (restIndex >= 0) bound[positional[restIndex].name] = supplied.slice(front, back);

  const known = new Set(signature.keywords.map(parameter => parameter.name));
  for (const parameter of signature.keywords) {
    if (Object.hasOwn(keywords, parameter.name)) bound[parameter.name] = keywords[parameter.name];
    else if (parameter.kind === "keyreq") throw new Error(`missing keyword: ${parameter.name}`);
    else bound[parameter.name] = OMITTED;
  }
  const extras = Object.keys(keywords).filter(name => !known.has(name));
  if (signature.keywordRest) {
    bound[signature.keywordRest] = Object.fromEntries(extras.map(name => [name, keywords[name]]));
  } else if (extras.length > 0) {
    throw new Error(`unknown keyword${extras.length === 1 ? "" : "s"}: ${extras.join(", ")}`);
  }

  bound[signature.block ?? "__swill_block"] = blockCarrier?.value ?? null;
  return bound;
}

/**
 * Returns the value `bindArguments` bound to the parameter `name`.
 *
 * @param {object} bound What `bindArguments` answered.
 * @param {string} name
 * @returns {unknown}
 */
export function argument(bound, name) {
  return bound[name];
}

/**
 * Calls `block` with `values`, and returns its result.
 *
 * @param {Function | null} block
 * @param {...unknown} values
 * @returns {unknown}
 * @throws {Error} `no block given`.
 */
export function yieldBlock(block, ...values) {
  if (block == null) throw new Error("no block given");
  return block(...values);
}
