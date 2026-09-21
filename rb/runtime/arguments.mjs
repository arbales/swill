// Ruby call-shape carriers and binding for methods JavaScript cannot express
// directly. Fixed positional methods never pass through this module.
const KEYWORDS = Symbol("Swill keywords");
const BLOCK = Symbol("Swill block");
const OMITTED = Object.freeze({});

export function keywordArguments(value) {
  return {[KEYWORDS]: true, value};
}

export function blockArgument(value) {
  return {[BLOCK]: true, value};
}

export function omittedArgument() {
  return OMITTED;
}

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

export function argument(bound, name) {
  return bound[name];
}

export function yieldBlock(block, ...values) {
  if (block == null) throw new Error("no block given");
  return block(...values);
}
