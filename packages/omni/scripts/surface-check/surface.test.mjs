// Teeth for parity.mjs and binding.mjs: a small repository in a temp directory, one planted defect per test, and the
// check must exit non-zero and name the thing. The clean tree must pass, so a check that fires on everything fails here too.
//
//   node --test scripts/surface-check/surface.test.mjs

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

const GLOSSARY = (concepts, heading = `${concepts.length} concepts`) =>
  `# Contract\n\n## 1. Surface\n\nx\n\n## 2. Glossary (${heading} — the parity unit)\n\n${concepts.join(" · ")}.\n\n## 3. Next\n\ny\n`;

const CLEAN = {
  "docs/api-contract.md": GLOSSARY(["run", "cwd (`cwd`)", "Child (`pid`, `stop`)"]),
  "bindings/node/index.d.ts": `// the surface
export function run(command: string, options?: Options): Promise<number>;
export interface Options { cwd?: string }
export interface Child {
  readonly pid: number;
  stop(options?: { graceMs?: number }): Promise<void>;
}
`,
  "crates/hugr-omni/src/lib.rs": `//! docs\nmod api;\nmod types;\n#[doc(hidden)]\npub mod binding;\n\npub use api::*;\n`,
  "crates/hugr-omni/src/api/mod.rs": `mod command;\n\npub use crate::types::Child;\npub use command::Command;\n`,
  "crates/hugr-omni/src/api/command.rs": `/// A command.
pub struct Command {
    req: u8,
}

impl Command {
    /// New.
    pub fn new() -> Command {
        Command { req: 0 }
    }

    /// The directory.
    pub fn cwd(&mut self) -> &mut Self {
        self
    }

    /// Runs.
    pub async fn run(&self) {}

    pub(crate) fn helper(&self) {}
}
`,
  "crates/hugr-omni/src/types.rs": `/// A child.
pub struct Child {
    /// Pid.
    pub pid: u32,
}

impl Child {
    /// Stops.
    pub fn stop(&self) {}
}

impl Drop for Child {
    fn drop(&mut self) {}
}
`,
  "scripts/surface-check/parity.txt": `# map
[excluded]
shell | no shell, ever
[parity]
run | run, Options | Command, Command::new, Command::run
cwd | Options.cwd | Command::cwd
Child | Child, Child.pid, Child.stop, Child.stop.graceMs | Child, Child.pid, Child::stop
`,
  "bindings/node/index.js": `"use strict";\nconst { existsSync } = require("node:fs");\nmodule.exports = { run: () => existsSync(".") };\n`,
  "bindings/node/src/lib.rs": `//! binding\nuse hugr_omni::Command;\npub fn make() -> Command {\n    Command::new()\n}\n`,
  "bindings/node/Cargo.toml": `[package]\nname = "x"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies]\n# a comment\nhugr-omni = "0.0.0"\nnapi = "3"\nnapi-derive = "3"\n\n[dev-dependencies]\ntokio = "1"\n\n[build-dependencies]\nnapi-build = "2"\n`,
};

/** A repository in a temp directory: CLEAN with `edits` applied (`path -> (text) => text`, or a string, or null to delete). */
function tree(edits = {}) {
  const root = mkdtempSync(join(tmpdir(), "surface-check-"));
  made.push(root);
  const files = { ...CLEAN };
  for (const [path, edit] of Object.entries(edits)) {
    if (edit === null) delete files[path];
    else files[path] = typeof edit === "string" ? edit : edit(files[path] ?? "");
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const run = (script, root) => {
  const r = spawnSync(process.execPath, [join(here, script), "--root", root], { encoding: "utf8" });
  return { code: r.status, text: `${r.stdout}${r.stderr}` };
};
const parity = (edits) => run("parity.mjs", tree(edits));
const binding = (edits) => run("binding.mjs", tree(edits));

/** The check exits `code` and its output contains every string of `names`. */
function expects(got, code, ...names) {
  assert.equal(got.code, code, `want exit ${code}, got ${got.code}:\n${got.text}`);
  for (const n of names) assert.ok(got.text.includes(n), `the output must name ${JSON.stringify(n)}:\n${got.text}`);
}

test("parity: the clean tree passes (a check that fires on everything is not a check)", () => {
  expects(parity(), 0, "parity OK");
});

test("parity: a comment is not a declaration, and a pub(crate) fn is not public API", () => {
  expects(parity({ "bindings/node/index.d.ts": (t) => t.replace("}\n", "}\n/* detach?: boolean; */\n// readonly extra: number;\n") }), 0);
});

test("parity: an option added to the TypeScript surface only fails and names it", () => {
  expects(parity({ "bindings/node/index.d.ts": (t) => t.replace("cwd?: string", "cwd?: string; detach?: boolean") }), 1, "TypeScript public item `Options.detach`");
});

test("parity: a method added to the Rust API only fails and names it", () => {
  expects(parity({ "crates/hugr-omni/src/api/command.rs": (t) => t.replace("    pub(crate) fn", "    /// d\n    pub fn detach(&self) {}\n\n    pub(crate) fn") }), 1, "Rust public item `Command::detach`");
});

test("parity: a field added to an exported Rust struct fails and names it", () => {
  expects(parity({ "crates/hugr-omni/src/types.rs": (t) => t.replace("    pub pid: u32,", "    pub pid: u32,\n    pub extra: u32,") }), 1, "`Child.extra`");
});

test("parity: a map entry for an item that does not exist fails and names it", () => {
  expects(parity({ "scripts/surface-check/parity.txt": (t) => t.replace("Options.cwd", "Options.cwd, Options.gone") }), 1, "places `Options.gone`");
});

test("parity: a concept with nothing in Rust fails and names the concept", () => {
  expects(parity({ "scripts/surface-check/parity.txt": (t) => t.replace("| Command::cwd", "|") }), 1, 'concept "cwd" has no Rust item');
});

test("parity: a glossary concept without a row fails and names it", () => {
  expects(parity({ "docs/api-contract.md": GLOSSARY(["run", "cwd (`cwd`)", "Child (`pid`, `stop`)", "timeout"]) }), 1, 'glossary concept "timeout" has no row');
});

test("parity: a row for something that is not a glossary concept fails and names it", () => {
  expects(parity({ "scripts/surface-check/parity.txt": (t) => `${t}timeout | | \n` }), 1, 'row "timeout" is not a glossary concept');
});

test("parity: a glossary of 16 concepts fails", () => {
  const sixteen = Array.from({ length: 16 }, (_, i) => `concept${i}`);
  expects(parity({ "docs/api-contract.md": GLOSSARY(sixteen) }), 1, "has 16 concepts; the limit is 15");
});

test("parity: a heading that miscounts the glossary fails", () => {
  expects(parity({ "docs/api-contract.md": GLOSSARY(["run", "cwd (`cwd`)", "Child (`pid`, `stop`)"], "4 concepts") }), 1, "says 4 concepts but lists 3");
});

test("parity: a name the glossary cites but no item carries fails and names it", () => {
  expects(parity({ "docs/api-contract.md": GLOSSARY(["run", "cwd (`cwd`)", "Child (`pid`, `stop`, `resize`)"]) }), 1, "cites `resize` under \"Child\"");
});

test("parity: an excluded capability in either language fails and names the word", () => {
  expects(parity({ "bindings/node/index.d.ts": (t) => t.replace("cwd?: string", "cwd?: string; shell?: boolean") }), 1, 'excluded word "shell"');
  expects(parity({ "crates/hugr-omni/src/api/command.rs": (t) => t.replace("    pub(crate) fn", "    pub fn use_shell(&self) {}\n\n    pub(crate) fn") }), 1, 'excluded word "shell"');
});

test("parity: an item placed in two concepts fails and names it", () => {
  expects(parity({ "scripts/surface-check/parity.txt": (t) => t.replace("Options.cwd |", "Options.cwd, run |") }), 1, "`run` is placed in two concepts");
});

test("parity: an input that cannot be read exits 2 and names the file or the construct", () => {
  expects(parity({ "bindings/node/index.d.ts": null }), 2, "bindings/node/index.d.ts");
  expects(parity({ "bindings/node/index.d.ts": "// nothing here\n" }), 2, "EMPTY");
  expects(parity({ "bindings/node/index.d.ts": (t) => `${t}export const x: number;\n` }), 2, "export const");
  expects(parity({ "bindings/node/index.d.ts": (t) => t.replace("export function", "function") }), 2, "must start with `export`");
  expects(parity({ "docs/api-contract.md": "# no glossary here\n" }), 2, "Glossary");
  expects(parity({ "scripts/surface-check/parity.txt": null }), 2, "parity.txt");
  expects(parity({ "scripts/surface-check/parity.txt": "[excluded]\nshell | x\n" }), 2, "[parity]");
  expects(parity({ "crates/hugr-omni/src/lib.rs": null }), 2, "lib.rs");
  expects(parity({ "crates/hugr-omni/src/api/mod.rs": (t) => `${t}pub use crate::types::Ghost;\n` }), 2, "`Ghost` is exported but defined nowhere");
  expects(parity({ "crates/hugr-omni/src/lib.rs": (t) => `${t}pub mod extra;\n` }), 2, "pub mod extra", "does not understand");
});

test("parity: a glob re-export other than `pub use api::*` is refused, so a type it would export cannot hide", () => {
  const extra = { "crates/hugr-omni/src/types.rs": (t) => `${t}\n/// Extra.\npub struct Extra {\n    pub x: u32,\n}\n` };
  expects(parity({ ...extra, "crates/hugr-omni/src/api/mod.rs": (t) => `${t}pub use crate::types::*;\n` }), 2, "is a glob", "api/mod.rs");
  expects(parity({ ...extra, "crates/hugr-omni/src/lib.rs": (t) => `${t}pub use crate::types::*;\n` }), 2, "is a glob", "lib.rs");
  expects(parity({ "crates/hugr-omni/src/api/mod.rs": (t) => `${t}pub use api::*;\n` }), 2, "is a glob");
});

test("parity: public syntax the Rust reader does not understand is refused, not skipped", () => {
  const inImpl = (line) => ({ "crates/hugr-omni/src/api/command.rs": (t) => t.replace("    pub(crate) fn", `    ${line}\n\n    pub(crate) fn`) });
  expects(parity(inImpl('pub extern "C" fn ffi(&self) {}')), 2, "does not understand", "impl Command");
  expects(parity(inImpl("pub const LIMIT: u32 = 1;")), 2, "pub const LIMIT");
  expects(parity(inImpl("pub type Out = u32;")), 2, "pub type Out");
  expects(parity({ "crates/hugr-omni/src/lib.rs": (t) => `${t}pub extern "C" fn ffi() {}\n` }), 2, "pub extern");
  expects(parity({ "crates/hugr-omni/src/lib.rs": (t) => `${t}pub static GLOBAL: u32 = 1;\n` }), 2, "pub static");
  expects(parity({ "crates/hugr-omni/src/types.rs": (t) => `${t}\n#[macro_export]\nmacro_rules! m {\n    () => {};\n}\n` }), 2, "exported macro");
  expects(parity({ "crates/hugr-omni/src/types.rs": (t) => t.replace("pub struct Child {\n    /// Pid.\n    pub pid: u32,\n}", "pub struct Child(pub u32);") }), 2, "tuple struct Child has a public field");
  expects(parity({ "crates/hugr-omni/src/types.rs": (t) => t.replace("    pub pid: u32,", "    pub pid: u32,\n    pub unsafe fn nope() {}") }), 2, "in struct Child");
});

test("parity: a method added through a qualified impl is seen; one the reader cannot place is refused", () => {
  const append = (text) => ({ "crates/hugr-omni/src/api/command.rs": (t) => `${t}\n${text}\n` });
  expects(parity(append("impl crate::api::Command {\n    pub fn shell(&self) {}\n}")), 1, "`Command::shell`");
  expects(parity(append("impl api::Command {\n    pub fn shell(&self) {}\n}")), 1, "`Command::shell`");
  expects(parity(append("impl<T> crate::api::Command<T> {\n    pub fn extra(&self) {}\n}")), 1, "`Command::extra`");
  expects(parity(append("fn helper() {\n    impl Command {\n        pub fn shell(&self) {}\n    }\n}")), 2, "nested inside a fn or mod");
  expects(parity(append("mod inner {\n    impl super::Command {\n        pub fn shell(&self) {}\n    }\n}")), 2, "nested inside a fn or mod");
  expects(parity(append("impl<T> <Command as Other>::Out {\n    pub fn shell(&self) {}\n}")), 2, "cannot read the impl header");
  expects(parity(append("type Cmd = Command;\n\nimpl Cmd {\n    pub fn shell(&self) {}\n}")), 2, "aliases an exported type");
  expects(parity(append("type Cmd = crate::api::Command;")), 2, "aliases an exported type");
  expects(parity(append("macro_rules! add {\n    () => {};\n}")), 2, "macro_rules!");
  expects(parity(append("impl Drop for Command {\n    fn drop(&mut self) {}\n}\n\nimpl<T> From<T> for Command {\n    fn from(_t: T) -> Command {\n        Command::new()\n    }\n}")), 0);
});

test("parity: code pulled in by include!, #[path] or a non-.rs file is refused, since the reader would not see it", () => {
  const append = (text) => ({ "crates/hugr-omni/src/api/command.rs": (t) => `${t}\n${text}\n` });
  const ext = "impl Command {\n    pub fn shell(self) -> Self {\n        self\n    }\n}\n";
  expects(parity({ ...append('include!("command_ext.in");'), "crates/hugr-omni/src/api/command_ext.in": ext }), 2, "command_ext.in", "not .rs");
  expects(parity(append('include!("command_ext.rs");')), 2, "pulls in code this reader does not see");
  expects(parity(append('const S: &str = include_str!("data.txt");')), 2, "include! and #[path] are refused");
  expects(parity(append('include_bytes!("data.bin");')), 2, "pulls in code");
  expects(parity(append('#[path = "elsewhere.rs"]\nmod elsewhere;')), 2, "#[path]");
  expects(parity(append('#[cfg_attr(unix, path = "unix.rs")]\nmod platform;')), 2, "#[path]");
  expects(parity({ "crates/hugr-omni/src/api/notes.md": "# a note\n" }), 2, "notes.md", "not .rs");
  expects(parity(append('fn helper() {\n    let _path = "x";\n}')), 0);
});

test("parity: a module named tests is skipped only under #[cfg(test)]; otherwise it is library code and is read", () => {
  const ext = "impl Command {\n    /// Shell.\n    pub fn shell(&mut self) -> &mut Self {\n        self\n    }\n}\n";
  const declared = (attr) => ({ "crates/hugr-omni/src/api/mod.rs": (t) => `${t}${attr}mod tests;\n`, "crates/hugr-omni/src/api/tests.rs": ext });
  expects(parity(declared("")), 1, "`Command::shell`");
  expects(parity(declared("#[allow(dead_code)]\n")), 1, "`Command::shell`");
  expects(parity({ "crates/hugr-omni/src/api/mod.rs": (t) => `${t}mod tests;\n`, "crates/hugr-omni/src/api/tests/mod.rs": "mod more;\n", "crates/hugr-omni/src/api/tests/more.rs": ext }), 1, "`Command::shell`");
  expects(parity(declared("#[cfg(test)]\n")), 0);
  expects(parity(declared("#[cfg(test)]\n#[allow(dead_code)]\n")), 0);
  expects(parity({ "crates/hugr-omni/src/api/mod.rs": (t) => `${t}#[cfg(test)]\nmod tests;\n`, "crates/hugr-omni/src/api/tests/mod.rs": "mod more;\n", "crates/hugr-omni/src/api/tests/more.rs": ext, "crates/hugr-omni/src/api/tests/data.txt": "x" }), 0);
});

test("parity: an impl header wrapped onto a where clause is still read, and an impl of another type that mentions an exported one is not mistaken for it", () => {
  const wrapped = (t) =>
    t.replace("impl Child {\n    /// Stops.\n    pub fn stop(&self) {}\n}", "impl Child\nwhere\n    Self: Sized,\n{\n    /// Stops.\n    pub fn stop(&self) {}\n\n    /// More.\n    pub fn extra(&self) {}\n}");
  expects(parity({ "crates/hugr-omni/src/types.rs": wrapped }), 1, "`Child::extra`");
  expects(parity({ "crates/hugr-omni/src/types.rs": (t) => `${t}\nstruct Other;\n\nimpl Other {\n    pub fn holds(&self, _c: Child) {}\n}\n` }), 0);
});

test("binding: the clean tree passes", () => {
  expects(binding(), 0, "binding sources OK");
});

test("binding: child_process, process.kill and setTimeout in index.js fail and name the line", () => {
  expects(binding({ "bindings/node/index.js": (t) => `${t}const cp = require("node:child_process");\n` }), 1, "index.js:4", "child_process");
  expects(binding({ "bindings/node/index.js": (t) => `${t}process.kill(1);\n` }), 1, "process.kill");
  expects(binding({ "bindings/node/index.js": (t) => `${t}setTimeout(() => child.stop(), 100);\n` }), 1, "setTimeout");
});

test("binding: std::process in the Rust source fails and names the file", () => {
  expects(binding({ "bindings/node/src/lib.rs": (t) => `${t}use std::process::Command as C;\n` }), 1, "src/lib.rs:6", "std::process");
});

test("binding: every spelling of a std path reaching process fails, written out or through any use tree", () => {
  const rs = (text) => ({ "bindings/node/src/lib.rs": (t) => `${t}${text}\n` });
  const spellings = [
    "use std::{process::Command};",
    "use std::{process::{self, Command}};",
    "use std::{self, process};",
    "use std::{\n    io,\n    process::Command,\n};",
    "use std::os::unix::process::CommandExt;",
    "use std::os::unix::{process::CommandExt};",
    "pub use std::process;",
    "pub(crate) use ::std::{process};",
    "use std::*;",
    "use std::os::unix::*;",
    "use std as s;",
    "use std::{self as s};",
    "extern crate std as s;",
    'fn go() {\n    let _ = std::process::Command::new("x");\n}',
    'fn go() {\n    let _ = ::std::process::Command::new("x");\n}',
    'fn go() {\n    let _ = std ::\n        process::Command::new("x");\n}',
    'fn go() {\n    let _ = std::os::unix::process::CommandExt::exec;\n}',
  ];
  for (const text of spellings) expects(binding(rs(text)), 1, "bindings/node/src/lib.rs:", "process control belongs to the Rust core");
  expects(binding(rs("use std::{process::Command")), 2, "never closed by `;`");
  expects(binding(rs("use std::{process::Command;")), 2, "cannot read the use declaration");
  expects(binding(rs("use std::{process::Command, ?};")), 2, "cannot read the use declaration");
  expects(binding(rs("use std::{sync::Arc, time::Duration, collections::HashMap};\nuse std::io::Write;\nuse hugr_omni::Command as Core;")), 0);
  expects(binding({ "bindings/node/build.rs": 'fn main() { std::process::exit(0); }\n' }), 1, "bindings/node/build.rs:1");
  expects(binding({ "bindings/node/build.rs": "fn main() {}\n" }), 0);
});

test("binding: the binding's own FFI is refused: an extern block declaring kill, #[link], #[no_mangle], inline assembly", () => {
  const rs = (text) => ({ "bindings/node/src/lib.rs": (t) => `${t}${text}\n` });
  const probe = 'unsafe extern "C" {\n    fn kill(pid: i32, sig: i32) -> i32;\n    fn fork() -> i32;\n}\n\n#[napi]\npub fn end(pid: i32) -> i32 {\n    unsafe { kill(pid, 9) }\n}';
  expects(binding(rs(probe)), 1, "bindings/node/src/lib.rs:6", "extern block or extern fn");
  for (const text of [
    'extern "system" {\n    fn TerminateProcess(h: isize, code: u32) -> i32;\n}',
    "extern {\n    fn fork() -> i32;\n}",
    'extern "C" fn callback() {}',
    '#[link(name = "c")]\nunsafe extern "C" {}',
    "#[no_mangle]\npub fn sneaky() {}",
    "#[unsafe(no_mangle)]\npub fn sneaky() {}",
    '#[export_name = "kill_it"]\npub fn sneaky() {}',
    '#[link_name = "kill"]\nfn k();',
    "fn go() {\n    unsafe { std::arch::asm!(\"syscall\") };\n}",
    'core::arch::global_asm!(".globl x");',
  ]) {
    expects(binding(rs(text)), 1, "bindings/node/src/lib.rs:", "process control belongs to the Rust core");
  }
  expects(binding({ "bindings/node/build.rs": 'extern "C" {\n    fn kill(pid: i32, sig: i32) -> i32;\n}\n' }), 1, "bindings/node/build.rs:1");
  expects(binding(rs("fn externally() {}\nfn extern_name() {}")), 0); // the word inside an identifier is not an extern item
});

test("binding: JavaScript run through Node-API is refused: run_script, and the JS ban list applies to Rust string literals", () => {
  const rs = (text) => ({ "bindings/node/src/lib.rs": (t) => `${t}${text}\n` });
  const probe = `#[napi]\npub fn end(env: napi::Env, pid: u32) {\n    let _ = env.run_script("process.getBuiltinModule('node:child_process').spawnSync('sleep', ['1'])");\n}`;
  expects(binding(rs(probe)), 1, "bindings/node/src/lib.rs:8", "run_script");
  expects(binding(rs('const SCRIPT: &str = "require(\'node:child_process\').spawnSync(\'x\')";')), 1, "child_process");
  expects(binding(rs('const SCRIPT: &str = "setTimeout(() => child.stop(), 5)";')), 1, "setTimeout");
  expects(binding(rs('const SCRIPT: &str = "process.getBuiltinModule(\'node:os\')";')), 1, "getBuiltinModule");
  expects(binding({ "bindings/node/index.js": (t) => `${t}const cp = process.getBuiltinModule("node:child_process");\n` }), 1, "index.js:4");
  expects(binding(rs('const NAME: &str = "hugr-omni";')), 0);
});

test("binding: more JavaScript process and timer APIs fail, and a require or import with a computed argument is refused", () => {
  const js = (text) => ({ "bindings/node/index.js": (t) => `${t}${text}\n` });
  for (const text of [
    'require("node:cluster").fork();',
    'require("node:timers/promises").scheduler.wait(100);',
    "await scheduler.wait(100);",
    'Bun.$`ls`;',
  ]) expects(binding(js(text)), 1, "index.js:4");
  expects(binding(js('const x = require(__dirname + "/x.js");')), 1, "not a string literal");
  expects(binding(js("const y = await import(name);")), 1, "not a string literal");
  expects(binding(js("const z = require(`./x.js`);")), 1, "not a string literal");
  expects(binding(js('const ok = require("node:os");\nconst here = require.resolve(`pkg-${process.arch}`);')), 0);
});

test("binding: a source the check cannot read is refused: a non-Rust file in src, a local require in index.js", () => {
  expects(binding({ "bindings/node/src/helper.c": "int main() { return 0; }\n" }), 1, "helper.c", "not .rs");
  expects(binding({ "bindings/node/index.js": (t) => `${t}const helper = require("./helper.js");\n` }), 1, "index.js:4", "another local file");
  expects(binding({ "bindings/node/index.js": (t) => `${t}import { x } from "../lib/x.mjs";\n` }), 1, "another local file");
});

test("a check script refuses an argument it does not know, or --root without a directory", () => {
  const root = tree({});
  for (const script of ["parity.mjs", "binding.mjs"]) {
    for (const args of [["--rot", root], ["--root"], ["--root", root, "--extra"], [root]]) {
      const r = spawnSync(process.execPath, [join(here, script), ...args], { encoding: "utf8" });
      assert.equal(r.status, 2, `${script} ${args.join(" ")}: ${r.stdout}${r.stderr}`);
      assert.ok(r.stderr.includes("unknown or incomplete arguments"), r.stderr);
    }
  }
});

test("parity: a glossary parenthetical that cites no backticked name is refused (nothing would be cross-checked)", () => {
  expects(parity({ "docs/api-contract.md": GLOSSARY(["run", "cwd (the directory)", "Child (`pid`, `stop`)"]) }), 1, 'concept "cwd" has a parenthetical that cites no `backticked` name');
});

test("binding: a dependency outside the core and Node-API fails and names it, in every table form cargo accepts", () => {
  const append = (text) => ({ "bindings/node/Cargo.toml": (t) => `${t}${text}` });
  const inline = (line) => ({ "bindings/node/Cargo.toml": (t) => t.replace('napi = "3"', `napi = "3"\n${line}`) });
  expects(binding(inline('libc = "0.2"')), 1, "normal dependency `libc`");
  expects(binding(inline("nix.version = \"0.29\"")), 1, "`nix`");
  expects(binding(append('\n[dependencies.libc]\nversion = "0.2"\n')), 1, "normal dependency `libc`");
  expects(binding(append("\n[target.'cfg(unix)'.dependencies]\nnix = \"0.29\"\n")), 1, "`nix`");
  expects(binding(append("\n[target.'cfg(unix)'.dependencies.libc]\nversion = \"0.2\"\n")), 1, "`libc`");
  expects(binding(inline('harmless = { package = "libc", version = "0.2" }')), 1, "`libc`");
  expects(binding(append('\n[dependencies.harmless]\npackage = "windows-sys"\nversion = "0.61"\n')), 1, "`windows-sys`");
  expects(binding({ "bindings/node/Cargo.toml": (t) => t.replace('napi-build = "2"', 'napi-build = "2"\nlibc = "0.2"') }), 1, "build dependency `libc`");
});

test("binding: dev-dependencies are not looked at, and a core or Node-API dependency in any table form is fine", () => {
  expects(binding({ "bindings/node/Cargo.toml": (t) => t.replace('tokio = "1"', 'libc = "0.2"') }), 0);
  expects(binding({ "bindings/node/Cargo.toml": (t) => `${t}\n[target.'cfg(windows)'.dependencies.napi-derive]\nversion = "3"\n` }), 0);
});

test("binding: a source that cannot be read exits 2", () => {
  expects(binding({ "bindings/node/index.js": null }), 2, "index.js");
  expects(binding({ "bindings/node/src/lib.rs": null }), 2, "bindings/node/src");
  expects(binding({ "bindings/node/src/lib.rs": null, "bindings/node/src/note.txt": "no Rust here" }), 2, "EMPTY");
  expects(binding({ "bindings/node/Cargo.toml": null }), 2, "Cargo.toml");
  expects(binding({ "bindings/node/Cargo.toml": (t) => `${t}\n[dependencies\n` }), 2, "cargo cannot read it");
  expects(binding({ "bindings/node/Cargo.toml": '[package]\nname = "x"\nversion = "0.0.0"\nedition = "2024"\n' }), 2, "EMPTY");
});
