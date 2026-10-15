import { describe, expect } from "bun:test"
import { existsSync } from "node:fs"
import { Effect } from "effect"
import path from "path"
import { cliIt } from "../lib/cli-process"

// Writing MCP config must not depend on ripgrep. Before the file index moved to the background, opening the CLI's
// Location ran ripgrep, downloading it from GitHub into the isolated home when rg was not on PATH, and a failed
// download failed `mcp add` with "ripgrep execution failed". These runs hide every rg on PATH and forbid the download,
// so that coupling fails here on every run instead of only when the network or the runner misbehaves. Windows indexes
// with ripgrep by default and other hosts with fff; ORCHESTRA_DISABLE_FFF puts every host on the ripgrep index.
const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH"
const withoutRipgrep = {
  [pathKey]: (process.env[pathKey] ?? "")
    .split(path.delimiter)
    .filter((dir) => !existsSync(path.join(dir, process.platform === "win32" ? "rg.exe" : "rg")))
    .join(path.delimiter),
  ORCHESTRA_DISABLE_RIPGREP_DOWNLOAD: "1",
  ORCHESTRA_DISABLE_FFF: "1",
}

describe("orchestra mcp add (non-interactive subprocess)", () => {
  cliIt.concurrent(
    "adds a remote server with HTTP headers",
    ({ home, orchestra }) =>
      Effect.gen(function* () {
        const result = yield* orchestra.spawn(
          [
            "mcp",
            "add",
            "github",
            "--url",
            "https://example.com/mcp",
            "--header",
            "Authorization=Bearer {env:GITHUB_TOKEN}",
            "--header",
            "X-Option=one=two",
          ],
          { env: withoutRipgrep },
        )
        orchestra.expectExit(result, 0)

        const config = yield* Effect.promise(() =>
          Bun.file(path.join(home, ".config", "orchestra", "orchestra.json")).json(),
        )
        expect(config.mcp.github).toEqual({
          type: "remote",
          url: "https://example.com/mcp",
          headers: {
            Authorization: "Bearer {env:GITHUB_TOKEN}",
            "X-Option": "one=two",
          },
        })
      }),
    60_000,
  )

  cliIt.concurrent(
    "adds a local server while preserving argv and environment values",
    ({ home, orchestra }) =>
      Effect.gen(function* () {
        const result = yield* orchestra.spawn(
          [
            "mcp",
            "add",
            "local",
            "--env",
            "API_KEY=secret",
            "--env",
            "VALUE=one=two",
            "--",
            "npx",
            "-y",
            "@example/server",
            "--label",
            "two words",
          ],
          { env: withoutRipgrep },
        )
        orchestra.expectExit(result, 0)

        const config = yield* Effect.promise(() =>
          Bun.file(path.join(home, ".config", "orchestra", "orchestra.json")).json(),
        )
        expect(config.mcp.local).toEqual({
          type: "local",
          command: ["npx", "-y", "@example/server", "--label", "two words"],
          environment: {
            API_KEY: "secret",
            VALUE: "one=two",
          },
        })
      }),
    60_000,
  )
})
