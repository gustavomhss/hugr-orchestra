// Reads the public surface of a TypeScript declaration file (bindings/node/index.d.ts) with a small tokenizer and
// parser, not with patterns over lines: comments and strings are skipped as tokens, and braces are matched.
//
// The surface is every exported function, interface, class and type alias, each member of an interface or class,
// and each member of a `{ ... }` type literal anywhere inside them, named by its path: `run`, `Child`, `Child.stop`,
// `Child.stop.graceMs`, `PtyOption.cols`. Parameter names are not items (they are positional); string-literal union
// values are not items either (they are values, not capabilities).
//
// Anything outside that grammar (a declaration that is not exported, an index signature, a template literal type)
// is `Unreadable`, never skipped: a surface that a reader silently half-understood is the failure this guards against.

import { resolve } from "node:path";

/** The input cannot be read as the grammar above (or a file is missing). The check reports it and exits 2. */
export class Unreadable extends Error {}

/** The repository root of a check script (shared by parity.mjs and binding.mjs): `--root <dir>` or `fallback`; any other argument is `Unreadable`, never ignored. */
export function rootArg(argv, fallback) {
  const args = argv.slice(2);
  if (args.length === 0) return fallback;
  if (args.length === 2 && args[0] === "--root" && args[1] !== "" && !args[1].startsWith("--")) return resolve(args[1]);
  throw new Unreadable(`unknown or incomplete arguments: ${args.join(" ")} (the only one is --root <dir>)`);
}

const WORD = /[A-Za-z_$][\w$]*/y;
const NUMBER = /\d[\w.]*/y;

function tokenize(src, file) {
  const toks = [];
  let i = 0;
  let line = 1;
  const bad = (what) => {
    throw new Unreadable(`${file}:${line}: ${what}`);
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else if (src.startsWith("//", i)) {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) bad("unterminated comment");
      for (const ch of src.slice(i, end)) if (ch === "\n") line++;
      i = end + 2;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\n") bad("unterminated string");
        j += src[j] === "\\" ? 2 : 1;
      }
      if (j >= src.length) bad("unterminated string");
      toks.push({ k: "str", v: src.slice(i + 1, j), line });
      i = j + 1;
    } else if (c === "`") {
      bad("template literal types are not supported by this reader");
    } else {
      WORD.lastIndex = i;
      NUMBER.lastIndex = i;
      const word = WORD.exec(src);
      const num = NUMBER.exec(src);
      if (word) {
        toks.push({ k: "id", v: word[0], line });
        i += word[0].length;
      } else if (num) {
        toks.push({ k: "num", v: num[0], line });
        i += num[0].length;
      } else {
        const v = src.startsWith("=>", i) ? "=>" : src.startsWith("...", i) ? "..." : c;
        toks.push({ k: "p", v, line });
        i += v.length;
      }
    }
  }
  return toks;
}

/** The sorted public surface of `text` (the contents of `file`, named only in messages). */
export function tsSurface(text, file) {
  const toks = tokenize(text, file);
  const items = new Set();
  let p = 0;
  const fail = (what) => {
    throw new Unreadable(`${file}:${toks[p] ? toks[p].line : "end"}: ${what}`);
  };
  const at = (v) => toks[p]?.k === "p" && toks[p].v === v;
  const word = () => {
    if (toks[p]?.k !== "id") fail("expected a name");
    return toks[p++].v;
  };

  /** One declaration's or member's tokens up to its terminator, recording the members of every `{...}` inside. */
  function body(path, inLiteral) {
    let depth = 0;
    for (;;) {
      const t = toks[p];
      if (!t) fail("unexpected end of file");
      if (t.k === "p" && t.v === "{") {
        p++;
        members(path);
      } else if (t.k === "p" && t.v === "}") {
        if (depth === 0 && inLiteral) return;
        fail("unbalanced }");
      } else if (t.k === "p" && depth === 0 && (t.v === ";" || (inLiteral && t.v === ","))) {
        p++;
        return;
      } else {
        if (t.k === "p" && "([<".includes(t.v)) depth++;
        if (t.k === "p" && ")]>".includes(t.v)) depth--;
        p++;
      }
    }
  }

  /** The members of a `{ ... }` whose `{` was just consumed; consumes the closing `}`. */
  function members(path) {
    while (!at("}")) {
      if (at(";") || at(",")) {
        p++;
        continue;
      }
      if (toks[p]?.k === "id" && toks[p].v === "readonly") p++;
      const t = toks[p];
      if (t?.k !== "id" && t?.k !== "str") fail("unsupported member (an index, call or construct signature?)");
      p++;
      if (at("?")) p++;
      if (!at(":") && !at("(")) fail(`unsupported member syntax after '${t.v}'`);
      const full = [...path, t.v];
      items.add(full.join("."));
      body(full, true);
    }
    p++;
  }

  while (p < toks.length) {
    if (toks[p].k !== "id" || toks[p].v !== "export") fail("every top-level declaration must start with `export`");
    p++;
    const kind = word();
    if (kind === "function") {
      const name = word();
      items.add(name);
      body([name], false);
    } else if (kind === "interface" || kind === "class") {
      const name = word();
      items.add(name);
      while (!at("{")) {
        if (p >= toks.length) fail(`${kind} ${name} has no body`);
        p++;
      }
      p++;
      members([name]);
    } else if (kind === "type") {
      const name = word();
      items.add(name);
      if (!at("=")) fail(`type ${name} has no \`=\``);
      p++;
      body([name], false);
    } else {
      fail(`unsupported declaration \`export ${kind}\``);
    }
  }
  if (items.size === 0) throw new Unreadable(`${file}: no exported declaration found (the surface came back EMPTY)`);
  return [...items].sort();
}
