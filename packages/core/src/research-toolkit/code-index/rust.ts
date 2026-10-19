export * as CodeIndexRust from "./rust"

import { existsSync } from "node:fs"
import path from "node:path"
import type { Node } from "web-tree-sitter"
import type { CodeIndexResolve } from "./resolve"
import type { CodeIndexTreeSitter } from "./tree-sitter"

// The Rust half of the indexer run (J2.5) and of the structural layer. `rust-analyzer scip` loads the workspace through
// the host's `cargo metadata` and its sysroot, so cargo is a precondition the host checks, not part of the pack. The run
// has no network, so cargo is told it is offline instead of failing on the registry. rust-analyzer also runs the
// workspace's build scripts; they run inside the same confinement, and a failure there only costs their generated code.

/** The host program rust-analyzer drives; without it a Rust shard keeps the tree-sitter layer alone. */
export const TOOLCHAIN = "cargo"

export const ENV = { CARGO_NET_OFFLINE: "true" }

/** Arguments after the executable; the run's cwd is the crate root. */
export function args(output: string) {
  return ["scip", ".", "--output", output, "--exclude-vendored-libraries"]
}

/**
 * Upstream tags.scm captures every function in a `declaration_list` as a method, which a `mod` body also is: a function
 * is a method only inside an `impl` or a `trait`.
 */
export function kind(node: Node, captured: string) {
  if (node.type !== "function_item") return captured
  return ["impl_item", "trait_item"].includes(node.parent?.parent?.type ?? "") ? "method" : "function"
}

/** `pub` exports (`pub(crate)` does not); a trait's members follow the trait. */
export function exported(node: Node, parent?: CodeIndexTreeSitter.Definition) {
  if (parent?.kind === "interface") return parent.exported
  return node.namedChildren.some((child) => child?.type === "visibility_modifier" && child.text === "pub")
}

/**
 * Top-level `use` paths, with the names a use list or an `as` binds, and `mod name;` declarations as `self::name`: the
 * declaration is what pulls the module's file into the crate.
 */
export function imports(root: Node) {
  return root.namedChildren.flatMap((node): CodeIndexTreeSitter.Import[] => {
    if (!node) return []
    const line = node.startPosition.row + 1
    if (node.type === "mod_item" && !node.childForFieldName("body")) {
      const name = node.childForFieldName("name")?.text
      return name ? [{ specifier: `self::${name}`, line, form: "static", names: [] }] : []
    }
    const argument = node.type === "use_declaration" ? node.childForFieldName("argument") : undefined
    if (!argument) return []
    if (argument.type === "scoped_use_list") {
      const names = argument.childForFieldName("list")?.namedChildren.flatMap((child) => child ? [bound(child)] : []) ?? []
      return [{ specifier: argument.childForFieldName("path")?.text ?? "", line, form: "static", names }]
    }
    if (argument.type === "use_as_clause")
      return [{ specifier: argument.childForFieldName("path")?.text ?? "", line, form: "static", names: [argument.childForFieldName("alias")?.text ?? ""] }]
    if (argument.type === "use_wildcard") return [{ specifier: argument.text.replace(/::\*$/, ""), line, form: "static", names: [] }]
    return [{ specifier: argument.text, line, form: "static", names: [bound(argument)] }]
  })
}

/**
 * `crate::`, `self::` and `super::` paths resolve to the module file they name, the longest prefix that is a file
 * (`a/b.rs` or `a/b/mod.rs`); any other path is a crate outside the repository, or `std`.
 */
export function resolver(root: string) {
  return (from: string, specifier: string): CodeIndexResolve.Resolution => {
    const segments = specifier.split("::").filter(Boolean)
    const head = segments[0]
    if (head !== "crate" && head !== "self" && head !== "super") return { kind: "package" }
    const start = head === "crate" ? crateSource(root, from) : moduleDir(from)
    const ups = segments.findIndex((segment) => segment !== "super")
    const base = head === "super" ? path.posix.join(start ?? ".", ...Array<string>(ups === -1 ? segments.length : ups).fill("..")) : start
    const rest = segments.slice(head === "super" ? (ups === -1 ? segments.length : ups) : 1)
    const to = base === undefined ? undefined : rest.map((_, index) => rest.slice(0, rest.length - index))
      .flatMap((prefix) => [`${path.posix.join(base, ...prefix)}.rs`, path.posix.join(base, ...prefix, "mod.rs")])
      .find((candidate) => existsSync(path.join(root, candidate)))
    if (to) return { kind: head === "crate" ? "alias" : "relative", to }
    return { kind: "unresolved" }
  }
}

function bound(node: Node) {
  if (node.type === "use_as_clause") return node.childForFieldName("alias")?.text ?? ""
  return node.text.split("::").at(-1) ?? node.text
}

// The directory a file's child modules live in: its own for a crate root or `mod.rs`, else one named after it.
function moduleDir(file: string) {
  const base = path.posix.basename(file)
  if (["mod.rs", "lib.rs", "main.rs"].includes(base)) return path.posix.dirname(file)
  return path.posix.join(path.posix.dirname(file), base.slice(0, -".rs".length))
}

// The nearest Cargo.toml's `src`, the crate root's directory under the default layout.
function crateSource(root: string, file: string): string | undefined {
  const dir = path.posix.dirname(file)
  if (existsSync(path.join(root, dir, "Cargo.toml"))) return path.posix.join(dir, "src")
  if (dir === "." || dir === "") return undefined
  return crateSource(root, dir)
}
