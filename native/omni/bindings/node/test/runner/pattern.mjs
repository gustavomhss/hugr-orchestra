// Scenario regexes: only the subset that JavaScript (with the `u` flag: matching by code point) and Rust's `regex`
// read the same way (conformance/SPEC.md). `pattern` checks a pattern against the subset, then compiles it with
// `new RegExp(p, "u")`. `conformance/regex-table.json` is the differential table every runner checks at startup.

const SYNTAX = "\\^$.|?*+()[]{}";
const isHex = (c) => c !== undefined && /^[0-9A-Fa-f]$/.test(c);

/** Compiles a scenario regex, or throws saying which construct is outside the subset. */
export function pattern(re) {
  if (typeof re !== "string") throw new Error("a regex is a string");
  try {
    subset(re);
  } catch (why) {
    throw new Error(`regex ${JSON.stringify(re)} uses ${why.message}, outside the JS/Rust subset (SPEC)`);
  }
  try {
    return new RegExp(re, "u");
  } catch (e) {
    throw new Error(`regex ${JSON.stringify(re)}: ${e.message}`);
  }
}

/**
 * The subset: literals; `^ $ | * + ? *? +? ??`; `{n}` `{n,}` `{n,m}`; `( )` and `(?: )`; classes without nesting, set
 * operators or ranges next to a class escape; escapes `\d \D \w \W` (`\d \w` inside a class), `\n \r \t \f \v`, `\xHH`,
 * `\uHHHH` (not a surrogate), and escaped syntax characters (`\-` only inside a class, as under the `u` flag).
 * Everything else (look-around, backreferences, named groups, flags, `\s`, `\b`, `\p`, Rust-only syntax) is refused.
 */
function subset(re) {
  const cs = [...re];
  let i = 0;
  let cls = false;
  // Inside a class: the last item was a class escape (`\d`, `\w`), or a `-` that could start a range.
  let afterEscape = false;
  let afterDash = false;
  // Outside a class: what a quantifier would repeat (JS `u` refuses a quantifier on nothing or on a quantifier).
  let prev = "nothing";
  const quantified = (lazy) => {
    if (prev === "atom") return "quantifier";
    if (prev === "quantifier" && lazy) return "lazy";
    throw new Error("a quantifier with nothing to repeat (after an assertion, `(`, `|` or another quantifier)");
  };
  while (i < cs.length) {
    const c = cs[i++];
    const wasEscape = afterEscape;
    const wasDash = afterDash;
    afterEscape = afterDash = false;
    if (c === "\\") {
      if (i >= cs.length) throw new Error("a trailing backslash");
      const e = cs[i++];
      if ((e === "d" || e === "w") && cls) {
        if (wasDash) throw new Error("a range ending in a class escape");
        afterEscape = true;
      } else if ("dDwW".includes(e) && !cls) {
        // a class escape outside a class
      } else if ("nrtfv".includes(e) || SYNTAX.includes(e) || e === "/" || (e === "-" && cls)) {
        // a control escape, an escaped syntax character, or `\-` inside a class
      } else if (e === "x" || e === "u") {
        const n = e === "x" ? 2 : 4;
        let digits = "";
        while (digits.length < n && isHex(cs[i])) digits += cs[i++];
        if (digits.length !== n) throw new Error(`\\${e} without ${n} hex digits`);
        const v = parseInt(digits, 16);
        if (v >= 0xd800 && v <= 0xdfff) throw new Error("a surrogate escape (JS pairs them, Rust refuses them)");
      } else {
        throw new Error(`the escape \\${e}`);
      }
      if (!cls) prev = "atom";
    } else if (c === "[" && !cls) {
      cls = true;
      if (cs[i] === "^") i++;
      if (cs[i] === "]") throw new Error("an empty class or a leading ] in a class");
    } else if (c === "[") {
      throw new Error("a nested class or an unescaped [ in a class");
    } else if (c === "]" && cls) {
      cls = false;
      prev = "atom";
    } else if ("&-~".includes(c) && cls && cs[i] === c) {
      throw new Error(`the class operator ${c}${c}`);
    } else if (c === "-" && cls && wasEscape && cs[i] !== "]") {
      throw new Error("a range starting at a class escape");
    } else if (c === "-" && cls) {
      afterDash = true;
    } else if (cls) {
      // any other character of a class is a literal
    } else if (c === ".") {
      prev = "atom";
    } else if (c === "(" && cs[i] === "?") {
      i++;
      if (cs[i++] !== ":") throw new Error("look-around, a named group or an inline flag");
      prev = "nothing";
    } else if ("(|^$".includes(c)) {
      prev = "nothing";
    } else if (c === ")") {
      prev = "atom";
    } else if ("*+?".includes(c)) {
      prev = quantified(c === "?");
    } else if (c === "{") {
      prev = quantified(false);
      let body = "";
      while (i < cs.length && cs[i] !== "}") body += cs[i++];
      const [n, m] = body.split(/,(.*)/s);
      const digits = (s) => /^[0-9]+$/.test(s ?? "");
      if (cs[i++] !== "}" || !digits(n) || !digits(m === undefined || m === "" ? n : m)) {
        throw new Error("a { that is not a {n}, {n,} or {n,m} quantifier (escape it)");
      }
    } else if (c === "}" || c === "]") {
      throw new Error(`a lone ${c} (escape it)`);
    } else {
      prev = "atom";
    }
  }
  if (cls) throw new Error("an unclosed class");
}

/** Checks the differential table; returns what is wrong with this engine (empty = the table passes). */
export function checkTable(table) {
  const errors = [];
  const accepted = table.accepted ?? [];
  const refused = table.refused ?? [];
  if (accepted.length === 0 || refused.length === 0) return ["regex-table: no accepted or no refused cases"];
  for (const c of accepted) {
    let re;
    try {
      re = pattern(c.pattern);
    } catch (e) {
      errors.push(`${c.pattern} must be accepted: ${e.message}`);
      continue;
    }
    for (const s of c.match ?? []) if (!re.test(s)) errors.push(`${c.pattern} must match ${JSON.stringify(s)}`);
    for (const s of c.nomatch ?? []) if (re.test(s)) errors.push(`${c.pattern} must not match ${JSON.stringify(s)}`);
    for (const [s, group] of Object.entries(c.group1 ?? {})) {
      const got = re.exec(s)?.[1] ?? null;
      if (got !== group) {
        errors.push(`${c.pattern} on ${JSON.stringify(s)}: group 1 is ${JSON.stringify(got)}, want ${JSON.stringify(group)}`);
      }
    }
  }
  for (const p of refused) {
    try {
      pattern(p);
      errors.push(`${p} must be refused`);
    } catch {
      // refused, as required
    }
  }
  return errors.map((e) => `regex-table: ${e}`);
}
