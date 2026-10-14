import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requirePackagedParserBindings } from "../src/onboard/parser-bindings.ts";
import { parserElf } from "./parser-elf.fixture.ts";

test("packaged Linux preflight requires the entire CPU/libc closure before any N-API load", async () => {
  const root = await mkdtemp(join(tmpdir(), "arsenal-parser-abi-"));
  try {
    const files = await Promise.all(["tree-sitter", "tree-sitter-typescript", "tree-sitter-python"].map(async (name) => {
      const file = join(root, name, "prebuilds/linux-x64", `${name}.node`);
      await mkdir(join(root, name, "prebuilds/linux-x64"), { recursive: true });
      await Bun.write(file, parserElf("musl"));
      return file;
    }));
    // Inert ELF is only a pre-load admission fixture; nothing dlopens these bytes.
    expect(requirePackagedParserBindings(root, { arch: "x64", libc: "musl" })).toEqual(files);
    expect(() => requirePackagedParserBindings(root, { arch: "x64", libc: undefined })).toThrow("PARSER_LIBC_DECLARATION_INVALID");
    for (const file of files) {
      const original = await readFile(file);
      await Bun.write(file, parserElf("glibc"));
      expect(() => requirePackagedParserBindings(root, { arch: "x64", libc: "musl" })).toThrow(`ELF_LIBC_MISMATCH: ${file}`);
      await Bun.write(file, parserElf("musl", 183));
      expect(() => requirePackagedParserBindings(root, { arch: "x64", libc: "musl" })).toThrow(`PARSER_BINDING_CPU_MISMATCH: ${file}`);
      await rm(file);
      expect(() => requirePackagedParserBindings(root, { arch: "x64", libc: "musl" })).toThrow(`PARSER_BINDING_NOT_REGULAR: ${file}`);
      const external = join(root, "external.node");
      await Bun.write(external, original);
      await symlink(external, file);
      expect(() => requirePackagedParserBindings(root, { arch: "x64", libc: "musl" })).toThrow(`PARSER_BINDING_NOT_REGULAR: ${file}`);
      await rm(file);
      await copyFile(external, file);
      expect(requirePackagedParserBindings(root, { arch: "x64", libc: "musl" })).toEqual(files);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
