import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requirePackagedParserBindings } from "../src/onboard/parser-bindings.ts";
import { parserElf } from "./parser-elf.fixture.ts";

test.each([["x64", "musl"], ["x64", "glibc"], ["arm64", "musl"], ["arm64", "glibc"]] as const)(
  "packaged Linux %s/%s preflight requires the entire closure before any N-API load", async (arch, libc) => {
  const root = await mkdtemp(join(tmpdir(), "arsenal-parser-abi-"));
  const input = { arch, libc };
  const machine = arch === "x64" ? 62 : 183;
  try {
    const files = await Promise.all(["tree-sitter", "tree-sitter-typescript", "tree-sitter-python"].map(async (name) => {
      const file = join(root, name, "prebuilds", `linux-${arch}`, `${name}.node`);
      await mkdir(join(root, name, "prebuilds", `linux-${arch}`), { recursive: true });
      await Bun.write(file, parserElf(libc, machine));
      return file;
    }));
    // Inert ELF is only a pre-load admission fixture; nothing dlopens these bytes.
    expect(requirePackagedParserBindings(root, input)).toEqual(files);
    expect(() => requirePackagedParserBindings(root, { arch, libc: undefined })).toThrow("PARSER_LIBC_DECLARATION_INVALID");
    expect(() => requirePackagedParserBindings(root, { arch, libc: "gnu" })).toThrow("PARSER_LIBC_DECLARATION_INVALID");
    expect(() => requirePackagedParserBindings(root, { arch: "ia32", libc })).toThrow("PARSER_BINDING_CPU_UNSUPPORTED");
    expect(() => requirePackagedParserBindings(join(root, "missing"), input)).toThrow("PARSER_BINDING_ROOT_NOT_REAL");
    for (const file of files) {
      const original = await readFile(file);
      await Bun.write(file, parserElf(libc === "musl" ? "glibc" : "musl", machine));
      expect(() => requirePackagedParserBindings(root, input)).toThrow(`ELF_LIBC_MISMATCH: ${file}`);
      await Bun.write(file, parserElf(libc, machine === 62 ? 183 : 62));
      expect(() => requirePackagedParserBindings(root, input)).toThrow(`PARSER_BINDING_CPU_MISMATCH: ${file}`);
      await rm(file);
      expect(() => requirePackagedParserBindings(root, input)).toThrow(`PARSER_BINDING_NOT_REGULAR: ${file}`);
      const external = join(root, "external.node");
      await Bun.write(external, original);
      await symlink(external, file);
      expect(() => requirePackagedParserBindings(root, input)).toThrow(`PARSER_BINDING_NOT_REGULAR: ${file}`);
      await rm(file);
      await copyFile(external, file);
      expect(requirePackagedParserBindings(root, input)).toEqual(files);
    }
    for (const directory of [join(root, "tree-sitter"), join(root, "tree-sitter-typescript/prebuilds"),
      join(root, "tree-sitter-python/prebuilds", `linux-${arch}`)]) {
      const saved = `${directory}-saved`;
      await rename(directory, saved);
      try {
        expect(() => requirePackagedParserBindings(root, input)).toThrow(`PARSER_BINDING_DIRECTORY_NOT_REAL: ${directory}`);
        await symlink(saved, directory, "dir");
        expect(() => requirePackagedParserBindings(root, input)).toThrow(`PARSER_BINDING_DIRECTORY_NOT_REAL: ${directory}`);
      } finally { await rm(directory, { force: true }); await rename(saved, directory); }
      expect(requirePackagedParserBindings(root, input)).toEqual(files);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
