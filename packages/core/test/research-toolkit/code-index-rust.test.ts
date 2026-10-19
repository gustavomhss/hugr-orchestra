import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { CodeIndexResolve } from "../../src/research-toolkit/code-index/resolve"
import { CodeIndexRust } from "../../src/research-toolkit/code-index/rust"
import { CodeIndexTreeSitter } from "../../src/research-toolkit/code-index/tree-sitter"
import { tmpdir } from "../fixture/tmpdir"

// X6, Rust: the rust-analyzer run, the structural layer over the Rust grammar and crate-path import resolution.

const SOURCE = `use std::fmt;
use crate::helpers::{double_it, Box as B};
use super::x as y;
mod helpers;

pub const LIMIT: u32 = 3;

pub struct Boxed {
    pub name: String,
    size: usize,
}

pub trait Runner {
    fn run(&self) -> i32;
}

impl Boxed {
    pub fn new() -> Self { Boxed { name: String::new(), size: 0 } }
    fn hidden(&self) {}
}

mod inner {
    pub fn helper() {}
}

pub(crate) fn double_it(value: i32) -> i32 { value * 2 }
`

describe("the Rust half of the code index", () => {
  test("rust-analyzer indexes the crate root into the host's output, with cargo offline", () => {
    expect(CodeIndexRust.args("/s/index.scip")).toEqual(["scip", ".", "--output", "/s/index.scip", "--exclude-vendored-libraries"])
    expect(CodeIndexRust.ENV).toEqual({ CARGO_NET_OFFLINE: "true" })
    expect(CodeIndexRust.TOOLCHAIN).toBe("cargo")
  })

  // Mutation control: make CodeIndexRust.kind return `captured`; `inner.helper` then reads as a method and goes red.
  // Mutation control: make CodeIndexRust.exported return true; `Boxed.size`, `hidden` and `double_it` go red.
  test("definitions carry kinds, members and the pub export rule; imports keep the names they bind", async () => {
    const result = await Effect.runPromise(CodeIndexTreeSitter.extract("src/lib.rs", SOURCE, "rust"))
    const by = Object.fromEntries(result.definitions.map((item) => [item.qualified, item]))
    expect(result.coverage).toEqual({ complete: true })
    expect(by.LIMIT).toMatchObject({ kind: "constant", startLine: 6, exported: true })
    expect(by.Boxed).toMatchObject({ kind: "class", startLine: 8, endLine: 11, exported: true })
    expect(by["Boxed.name"]).toMatchObject({ kind: "property", exported: true })
    expect(by["Boxed.size"]).toMatchObject({ kind: "property", exported: false })
    expect(by["Runner.run"]).toMatchObject({ kind: "method", startLine: 14, exported: true })
    expect(by.new).toMatchObject({ kind: "method", startLine: 18, exported: true })
    expect(by.hidden).toMatchObject({ kind: "method", exported: false })
    expect(by["inner.helper"]).toMatchObject({ kind: "function", startLine: 23 })
    expect(by.double_it).toMatchObject({ kind: "function", startLine: 26, exported: false })
    expect(result.imports).toEqual([
      { specifier: "std::fmt", line: 1, form: "static", names: ["fmt"] },
      { specifier: "crate::helpers", line: 2, form: "static", names: ["double_it", "B"] },
      { specifier: "super::x", line: 3, form: "static", names: ["y"] },
      { specifier: "self::helpers", line: 4, form: "static", names: [] },
    ])
  })

  // Mutation control: make CodeIndexRust.resolver return `{ kind: "package" }` for every path; the crate cases go red.
  test("crate, self and super paths resolve to the module file they name; other crates are packages", async () => {
    await using dir = await tmpdir()
    const files: Record<string, string> = {
      "rs/Cargo.toml": "[package]\nname = \"fixture\"\nversion = \"0.1.0\"\n",
      "rs/src/lib.rs": "mod helpers;\nmod nested;\n",
      "rs/src/helpers.rs": "pub fn double_it() {}\n",
      "rs/src/nested/mod.rs": "mod leaf;\n",
      "rs/src/nested/leaf.rs": "",
    }
    await Promise.all(Object.entries(files).map(async ([file, text]) => {
      await fs.mkdir(path.join(dir.path, path.dirname(file)), { recursive: true })
      await Bun.write(path.join(dir.path, file), text)
    }))
    const resolver = await Effect.runPromise(CodeIndexResolve.make(dir.path))
    expect(resolver.resolve("rs/src/lib.rs", "self::helpers")).toEqual({ kind: "relative", to: "rs/src/helpers.rs" })
    expect(resolver.resolve("rs/src/nested/leaf.rs", "crate::helpers::double_it")).toEqual({ kind: "alias", to: "rs/src/helpers.rs" })
    expect(resolver.resolve("rs/src/nested/mod.rs", "self::leaf")).toEqual({ kind: "relative", to: "rs/src/nested/leaf.rs" })
    expect(resolver.resolve("rs/src/nested/leaf.rs", "super::super::helpers")).toEqual({ kind: "relative", to: "rs/src/helpers.rs" })
    expect(resolver.resolve("rs/src/lib.rs", "crate::absent")).toEqual({ kind: "unresolved" })
    expect(resolver.resolve("rs/src/lib.rs", "std::fmt")).toEqual({ kind: "package" })
  })
})
