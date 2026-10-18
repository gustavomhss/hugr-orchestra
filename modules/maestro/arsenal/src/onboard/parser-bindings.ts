import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Elf } from "@orchestra/schema/elf";

// Packaged Linux closure admission, before any require/dlopen/prototype setup.
// The compiled producer declares libc; compatible symbols in a foreign libc
// binding cannot relax that declaration. Only exact shipped paths are admitted.
export function requirePackagedParserBindings(directory: string, input: { arch: string; libc: unknown }) {
  const machine = input.arch === "x64" ? 62 : input.arch === "arm64" ? 183 : undefined;
  if (machine === undefined) throw new Error(`PARSER_BINDING_CPU_UNSUPPORTED: ${input.arch}`);
  const names = ["tree-sitter", "tree-sitter-typescript", "tree-sitter-python"];
  const bindings = names.map((name) => join(directory, name, "prebuilds", `linux-${input.arch}`, `${name}.node`));
  const root = lstatSync(directory, { throwIfNoEntry: false });
  if (!root?.isDirectory() || root.isSymbolicLink()) throw new Error(`PARSER_BINDING_ROOT_NOT_REAL: ${bindings[0]}`);
  names.forEach((name, i) => {
    for (const path of [join(directory, name), join(directory, name, "prebuilds"), join(directory, name, "prebuilds", `linux-${input.arch}`)]) {
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error(`PARSER_BINDING_DIRECTORY_NOT_REAL: ${path}`);
    }
    const file = bindings[i];
    const stat = lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || !stat.size || stat.nlink !== 1)
      throw new Error(`PARSER_BINDING_NOT_REGULAR: ${file}`);
  });
  if (input.libc !== "glibc" && input.libc !== "musl") throw new Error(`PARSER_LIBC_DECLARATION_INVALID: ${String(input.libc)}`);
  const libc = input.libc;
  bindings.forEach((file) => {
    const elf = Elf.requireLibc(readFileSync(file), libc, file);
    if (elf.machine !== machine) throw new Error(`PARSER_BINDING_CPU_MISMATCH: ${file}`);
  });
  return bindings;
}
