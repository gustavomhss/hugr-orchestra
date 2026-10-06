// Reads the public API of the core crate (crates/hugr-omni): what `lib.rs` and `api/mod.rs` re-export with `pub use`,
// then, for each exported type, its public fields and the `pub fn`s of its inherent `impl` blocks.
//
// Scope: these checks catch honest drift by our own contributors (a renamed option, a forgotten README update, a binding
// that starts spawning), not an adversary deliberately evading them.
//
// This is a line reader, not a Rust parser, and it says so: it relies on the layout `cargo fmt --check` enforces in CI
// (items at column 0, members at 4 spaces, a block closed by `}` at column 0). It does not expand macros, follow
// `cfg`, or see trait impls (`impl Trait for T` is not an inherent impl; enum variants are values, not capabilities).
//
// What it understands, it reads. What it does not understand, it refuses: every public syntax outside the list below
// is `Unreadable`, never skipped, so a new public form can only turn this check red until the reader learns it.
//   - column 0 of lib.rs and api/mod.rs: `pub use` (a path, `{a, b}`, no `as`), `#[doc(hidden)] pub mod`, and the one
//     glob `pub use api::*;` in lib.rs; any other `pub ...` line, any other glob, any public module is refused;
//   - an exported name must be defined exactly once as a `pub struct` or `pub enum` of this crate (or come from another
//     crate); a tuple struct with a public field, a struct body that cannot be found, is refused;
//   - an inherent impl of an exported type, at column 0, written `impl T`, `impl<..> T<..>` or through a path
//     (`impl crate::api::T`: the last segment names the type): each `    pub fn` (with `const`/`async`/`unsafe`) is a
//     method; any other `    pub ...` line (`pub extern "C" fn`, `pub const`, `pub type`) is refused; an impl of an
//     exported type nested inside a fn or mod, an impl header of another shape that mentions one, and a module-level
//     alias of one (`type X = T;`, which an `impl X` would hide) are refused;
//   - `#[macro_export]` and any `macro_rules!` in the crate are refused (a macro can write public API this reader
//     cannot expand), and so are `include!`/`include_str!`/`include_bytes!` and `#[path = ...]`, which pull in code
//     this reader would not see; a file under src that is not `.rs` is refused for the same reason (a module could
//     include it). Test modules are skipped only when their `mod x;` carries `#[cfg(test)]`; any other module file,
//     whatever its name, is part of the library and is read.
//
// Declared limit (C-PAR-01 is v0.2 for the rest): what the reader compares is the capabilities, items named `Type`,
// `Type.field` and `Type::method`. Enum variants here and string-literal union values in index.d.ts (error codes,
// `reason`, `stream`) are values: they are not compared across languages, so a code that exists in one language only
// is not caught.

import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { Unreadable } from "./dts.mjs";

const SRC = "crates/hugr-omni/src";

const read = (path) => {
  try {
    return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  } catch (e) {
    throw new Unreadable(`${path}: cannot be read (${e.code ?? e.message})`);
  }
};

/** Every file under `dir`: `{ rs, other }`, paths relative to `root`. */
function sources(root, dir) {
  const out = { rs: [], other: [] };
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch (e) {
    throw new Unreadable(`${dir}: cannot be listed (${e.code ?? e.message})`);
  }
  for (const e of entries) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      const sub = sources(root, path);
      out.rs.push(...sub.rs);
      out.other.push(...sub.other);
    } else (e.name.endsWith(".rs") ? out.rs : out.other).push(path);
  }
  return out;
}

/**
 * The files and directories of test modules: those a `mod x;` declared right under `#[cfg(test)]` resolves to
 * (`x.rs`, `x/mod.rs`, and `x/` for its children). A module without that attribute is part of the library, so it is read.
 */
function testModules(files) {
  const skip = [];
  for (const { f, lines } of files) {
    const dir = posix.dirname(f);
    const base = posix.basename(f);
    const own = ["mod.rs", "lib.rs", "main.rs"].includes(base) ? dir : `${dir}/${base.slice(0, -3)}`;
    lines.forEach((l, i) => {
      const m = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/.exec(l);
      if (!m) return;
      let cfgTest = false;
      for (let j = i - 1; j >= 0 && /^\s*(#\[|\/\/)/.test(lines[j]); j--) cfgTest ||= /#\[cfg\(\s*test\s*\)\]/.test(lines[j]);
      if (cfgTest) skip.push(`${own}/${m[1]}.rs`, `${own}/${m[1]}/`);
    });
  }
  return (path) => skip.some((s) => (s.endsWith("/") ? path.startsWith(s) : path === s));
}

/** The names a file re-exports with `pub use`: `{ name, foreign }`, `foreign` when the path leaves this crate. */
function reexports(text, file) {
  const lines = text.split("\n");
  const local = new Set(["crate", "self", "super"]);
  for (const l of lines) {
    const m = /^(?:pub )?mod (\w+)\b/.exec(l);
    if (m) local.add(m[1]);
  }
  lines.forEach((l, i) => {
    if (!/^pub\s/.test(l) || /^pub use\b/.test(l)) return;
    const hidden = /^pub mod \w+/.test(l) && (lines[i - 1] ?? "").startsWith("#[doc(hidden)]");
    if (!hidden) throw new Unreadable(`${file}:${i + 1}: \`${l.trim()}\` is public syntax this reader does not understand (it maps re-exported types)`);
  });
  const out = [];
  for (const m of text.matchAll(/^pub use ([^;]+);/gm)) {
    const path = m[1].replace(/\s+/g, "");
    if (/\bas\b/.test(m[1])) throw new Unreadable(`${file}: \`pub use ${path}\` renames; not supported`);
    if (path.endsWith("*")) {
      if (file.endsWith("/lib.rs") && path === "api::*") continue; // api/mod.rs is read on its own
      throw new Unreadable(`${file}: \`pub use ${path}\` is a glob; only \`pub use api::*;\` in lib.rs is read, list the names instead`);
    }
    const foreign = !local.has(path.split("::")[0]);
    const brace = /^(.*)::\{([^{}]*)\}$/.exec(path);
    if (brace) for (const name of brace[2].split(",").filter(Boolean)) out.push({ name, foreign });
    else if (/^[\w:]+$/.test(path)) out.push({ name: path.split("::").pop(), foreign });
    else throw new Unreadable(`${file}: cannot read \`pub use ${path}\``);
  }
  return out;
}

/**
 * The type an inherent `impl` header is for, by its last path segment (`impl<T> crate::api::Command<T> where ...` is
 * `Command`; an exported name is unique in the crate, so the last segment names it). `null` when the header has another
 * shape (`impl<T> <X as Y>::Z`).
 */
function implTarget(header) {
  let rest = header.replace(/^\s*impl\s*/, "");
  if (rest.startsWith("<")) {
    let depth = 0;
    let k = 0;
    for (; k < rest.length; k++) {
      if (rest[k] === "<") depth++;
      else if (rest[k] === ">" && rest[k - 1] !== "-") depth--;
      if (depth === 0) break;
    }
    rest = rest.slice(k + 1).trimStart();
  }
  const path = /^(?:::)?\w+(?:\s*::\s*\w+)*/.exec(rest);
  return path ? path[0].replace(/\s+/g, "").split("::").pop() : null;
}

/** `    pub ...` at member indentation (`pub(crate)` is not public). */
const publicMember = (line) => /^ {4}pub\s/.test(line);

/** The `{...}` body of the block that starts at `lines[from]`: the lines up to the `}` at column 0. */
function body(lines, from, file) {
  const out = [];
  for (let j = from + 1; ; j++) {
    if (j >= lines.length) throw new Unreadable(`${file}:${from + 1}: the block is never closed by a \`}\` at column 0`);
    if (lines[j] === "}") return out;
    out.push([j, lines[j]]);
  }
}

/** The sorted public API of the core crate under `root`, and the exported names that live outside it. */
export function rustSurface(root) {
  const exported = [
    ...reexports(read(join(root, SRC, "lib.rs")), `${SRC}/lib.rs`),
    ...reexports(read(join(root, SRC, "api/mod.rs")), `${SRC}/api/mod.rs`),
  ];
  const listed = sources(root, SRC);
  const everything = listed.rs.map((f) => ({ f, lines: read(join(root, f)).split("\n") }));
  const isTest = testModules(everything);
  const strange = listed.other.find((f) => !isTest(f));
  if (strange) throw new Unreadable(`${strange}: a file under src that is not .rs; a module could include it and this reader would not see it`);
  const files = everything.filter(({ f }) => !isTest(f));
  for (const { f, lines } of files) {
    const pulled = lines.findIndex((l) => /\binclude(?:_str|_bytes)?!\s*[(\[{]/.test(l) || /#\s*\[\s*(?:cfg_attr\s*\([^\]]*?)?\bpath\s*=/.test(l));
    if (pulled >= 0) throw new Unreadable(`${f}:${pulled + 1}: \`${lines[pulled].trim().slice(0, 60)}\` pulls in code this reader does not see (include! and #[path] are refused)`);
    const at = lines.findIndex((l) => l.includes("#[macro_export]"));
    if (at >= 0) throw new Unreadable(`${f}:${at + 1}: an exported macro is public API this reader cannot name`);
    const rules = lines.findIndex((l) => /^\s*macro_rules!/.test(l));
    if (rules >= 0) throw new Unreadable(`${f}:${rules + 1}: a macro_rules! can write impls this reader cannot expand`);
  }
  const items = new Set();
  const foreign = [];
  const names = new Set();
  for (const { name, foreign: outside } of exported) {
    items.add(name);
    if (outside) foreign.push(name);
    else names.add(name);
  }
  for (const name of names) {
    const def = new RegExp(`^pub (struct|enum|union|trait|type|fn|const|static) ${name}\\b`);
    const found = files.flatMap(({ f, lines }) => lines.flatMap((l, i) => (def.test(l) ? [{ f, lines, i, kind: def.exec(l)[1] }] : [])));
    if (found.length !== 1) {
      const where = found.map(({ f, i }) => `${f}:${i + 1}`).join(", ");
      throw new Unreadable(`${SRC}: \`${name}\` is exported but ${found.length === 0 ? "defined nowhere" : `defined ${found.length} times (${where})`}`);
    }
    const { f, lines, i, kind } = found[0];
    if (kind !== "struct" && kind !== "enum") throw new Unreadable(`${f}:${i + 1}: \`${name}\` is a ${kind}; this reader maps structs and enums`);
    if (kind === "struct") {
      if (lines[i].endsWith("{")) {
        for (const [j, l] of body(lines, i, f)) {
          const field = /^ {4}pub (\w+):/.exec(l);
          if (field) items.add(`${name}.${field[1]}`);
          else if (publicMember(l)) throw new Unreadable(`${f}:${j + 1}: \`${l.trim()}\` is public syntax this reader does not understand in struct ${name}`);
        }
      } else if (lines[i].includes("(")) {
        if (/\bpub\b/.test(lines[i].slice(lines[i].indexOf("(")))) throw new Unreadable(`${f}:${i + 1}: tuple struct ${name} has a public field; not supported`);
      } else if (!lines[i].endsWith(";")) {
        throw new Unreadable(`${f}:${i + 1}: cannot find the body of struct ${name}`);
      }
    }
  }
  const alias = new RegExp(`^(?:pub(?:\\([^)]*\\))?\\s+)?type\\s+\\w+(?:<[^>]*>)?\\s*=\\s*(?:\\w+::)*(${[...names].join("|")})(?:<[^>]*>)?\\s*;`);
  for (const { f, lines } of files) {
    const at = lines.findIndex((l) => names.size > 0 && alias.test(l));
    if (at >= 0) throw new Unreadable(`${f}:${at + 1}: \`${lines[at].trim()}\` aliases an exported type; an \`impl\` of the alias would hide its methods from this reader`);
  }
  for (const { f, lines } of files) {
    lines.forEach((l, i) => {
      if (!/^\s*impl[\s<]/.test(l)) return;
      let end = i;
      while (end < lines.length && !lines[end].endsWith("{")) end++;
      const header = lines.slice(i, end + 1).join(" ");
      if (/\sfor\s/.test(header)) return; // a trait impl
      const target = implTarget(header);
      if (target === null) {
        if ([...names].some((n) => new RegExp(`\\b${n}\\b`).test(header))) throw new Unreadable(`${f}:${i + 1}: cannot read the impl header \`${header.trim().slice(0, 60)}\``);
        return;
      }
      if (!names.has(target)) return; // an impl of some other type that merely mentions an exported one
      if (/^\s/.test(l)) throw new Unreadable(`${f}:${i + 1}: an impl of ${target} nested inside a fn or mod is not read; move it to column 0`);
      for (const [j, member] of body(lines, end, f)) {
        const fn = /^ {4}pub (?:(?:const|async|unsafe) )*fn (\w+)/.exec(member);
        if (fn) items.add(`${target}::${fn[1]}`);
        else if (publicMember(member)) throw new Unreadable(`${f}:${j + 1}: \`${member.trim()}\` is public syntax this reader does not understand in impl ${target}`);
      }
    });
  }
  if (names.size === 0) throw new Unreadable(`${SRC}: no \`pub use\` re-export found (the surface came back EMPTY)`);
  return { items: [...items].sort(), foreign };
}
