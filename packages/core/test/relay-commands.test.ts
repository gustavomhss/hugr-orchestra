import { describe, expect, test } from "bun:test"
import { mkdir } from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { RelayCommands } from "../src/relay-commands"
import { tmpdir } from "./fixture/tmpdir"

describe("RelayCommands.detect", () => {
  test("reads the check commands each manifest declares, with the lockfile's runner", async () => {
    await using dir = await tmpdir()
    await Bun.write(
      path.join(dir.path, "package.json"),
      JSON.stringify({ scripts: { test: "x", typecheck: "x", lint: "x", dev: "x", "format:check": "x" } }),
    )
    await Bun.write(path.join(dir.path, "bun.lock"), "")
    await Bun.write(path.join(dir.path, "Makefile"), "test:\n\tgo test\nFOO := bar\nlint: test\n")
    await Bun.write(path.join(dir.path, "pyproject.toml"), "[tool.pytest.ini_options]\n[tool.ruff]\n")
    await mkdir(path.join(dir.path, "tests"))
    await Bun.write(path.join(dir.path, "tests", "test_b.py"), "")
    await Bun.write(path.join(dir.path, "tests", "test_a.py"), "")
    await Bun.write(path.join(dir.path, "tests", "helper.py"), "")

    const detected = await Effect.runPromise(RelayCommands.detect(dir.path))

    expect(detected.commands).toEqual([
      { command: "bun run test", source: "package.json", kind: "test" },
      { command: "bun run typecheck", source: "package.json", kind: "typecheck" },
      { command: "bun run lint", source: "package.json", kind: "lint" },
      { command: "bun run format:check", source: "package.json", kind: "format" },
      { command: "pytest -q", source: "pyproject.toml", kind: "test" },
      { command: "ruff check .", source: "pyproject.toml", kind: "lint" },
      { command: "make test", source: "Makefile", kind: "test" },
      { command: "make lint", source: "Makefile", kind: "lint" },
    ])
    expect(detected.pytest).toEqual(["tests/test_a.py", "tests/test_b.py"])
  })

  test("finds nothing in a folder without manifests", async () => {
    await using dir = await tmpdir()
    expect(await Effect.runPromise(RelayCommands.detect(dir.path))).toEqual({ commands: [], pytest: [] })
  })
})
