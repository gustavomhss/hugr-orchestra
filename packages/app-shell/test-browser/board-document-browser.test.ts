import { test } from "bun:test"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { boardChromiumRequired } from "./board-chromium-required"
import { validateBoardChromiumReport } from "./board-chromium-report"

// Repair the security oracle, not the assertion: upstream DOMPurify does not consider happy-dom safe.
// This CI-discovered wrapper executes the real source components in Chromium and refuses zero/skipped tests.
test("Board document security and operation notice in real Chromium (two required, unskipped regressions)", async () => {
  if (!process.env.CI && !process.env.GITHUB_RUN_ID) throw new Error("Chromium regression requires CI")
  const out = await mkdtemp(path.join(tmpdir(), "board-document-chromium-"))
  const run = async (args: string[]) => {
    const child = Bun.spawn([process.execPath, ...args], {
      cwd: path.resolve(import.meta.dir, ".."),
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(out, "result.json") },
      stdout: "pipe", stderr: "pipe", timeout: 600000,
    })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    if (code !== 0) throw new Error(`${args.join(" ")} exited ${code}/${child.signalCode}\n${stdout.slice(-20000)}\n${stderr.slice(-20000)}`)
  }
  try {
    await run(["x", "playwright", "install", ...(process.platform === "linux" ? ["--with-deps"] : []), "--only-shell", "chromium"])
    await run(["x", "playwright", "test", "--config", "playwright.config.ts", ...Object.values(boardChromiumRequired).map((journey) => `e2e/${journey.file}`), "--project", "chromium", "--retries", "0", "--reporter", "json"])
    const result = await Bun.file(path.join(out, "result.json")).json()
    console.log(`Board Chromium: verified required executions: ${validateBoardChromiumReport(result).join(", ")}`)
  } finally {
    await rm(out, { recursive: true, force: true })
  }
}, 1200000)
