// Shared by the ripgrep download tests: a local release server, real release-format archives, and ordering helpers
// that never depend on how long something takes.
import { createHash } from "crypto"
import fs from "fs/promises"
import path from "path"
import { Cause, Effect, Exit, Option } from "effect"
import type { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { tmpdir } from "./tmpdir"

export const executable = process.platform === "win32" ? "rg.exe" : "rg"
export const ROOT = "ripgrep-test"
export const repository = path.resolve(import.meta.dir, "../../../..")

/** A gate a test opens when it chooses, so ordering never depends on how long something takes. */
export const gate = () => {
  const state: { open?: () => void } = {}
  const promise = new Promise<void>((resolve) => (state.open = resolve))
  return { promise, open: () => state.open?.() }
}

/** Waits, in real time and whatever clock the test runs on, until `ready` holds. */
export const until = (ready: () => boolean) =>
  Effect.promise(async () => {
    for (let tries = 0; tries < 2_000 && !ready(); tries++) await Bun.sleep(5)
    if (!ready()) throw new Error("condition never held")
  })

/** A release server whose handler sees the 1-based request number; `requests` counts every request it got. */
export const serve = (handler: (request: number) => Response | Promise<Response>) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const counter = { requests: 0 }
      const server = Bun.serve({ port: 0, fetch: () => handler(++counter.requests) })
      return { counter, server, url: new URL("/archive", server.url).href }
    }),
    (input) => Effect.promise(() => input.server.stop(true)),
  )

export const withTmp = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
).pipe(Effect.map((tmp) => tmp.path))

/**
 * A real archive in this platform's release format holding ROOT/rg (rg.exe on Windows): by default a copy of the
 * real `rg` on PATH, which CI provisions, so the installed copy passes the `rg --version` check.
 */
export const archive = Effect.fnUntraced(function* (dir: string, content?: string) {
  const source = path.join(dir, "source")
  yield* Effect.promise(() => fs.mkdir(path.join(source, ROOT), { recursive: true }))
  const real = Bun.which(executable)
  if (content === undefined && !real) throw new Error(`these tests copy the ${executable} on PATH, and there is none`)
  const bytes = content === undefined ? yield* Effect.promise(() => Bun.file(real!).bytes()) : Buffer.from(content)
  yield* Effect.promise(() => fs.writeFile(path.join(source, ROOT, executable), bytes))
  const extension = process.platform === "win32" ? ("zip" as const) : ("tar.gz" as const)
  const file = path.join(dir, `archive.${extension}`)
  // Windows releases are zips, which the System32 bsdtar writes from the name; elsewhere a gzipped tarball.
  yield* Effect.promise(() =>
    process.platform === "win32"
      ? Bun.$`${path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")} -a -cf ${file} ${ROOT}`
          .cwd(source)
          .quiet()
      : Bun.$`tar -czf ${file} ${ROOT}`.cwd(source).quiet(),
  )
  const archived = yield* Effect.promise(() => Bun.file(file).bytes())
  return {
    bytes: archived,
    executable: bytes,
    release: (url: string) => ({
      url,
      extension,
      root: ROOT,
      sha256: createHash("sha256").update(archived).digest("hex"),
    }),
  }
})

export const placeholder = (url: string): RipgrepBinary.Release => ({
  url,
  sha256: "0".repeat(64),
  extension: "tar.gz",
  root: ROOT,
})

export const options = (directory: string, release: RipgrepBinary.Release): Partial<RipgrepBinary.Options> => ({
  system: () => undefined,
  directory,
  release,
  // CI sets ORCHESTRA_DISABLE_RIPGREP_DOWNLOAD; these tests download only from their local server.
  download: true,
  connectTimeout: "2 seconds",
  attemptTimeout: "10 seconds",
  attempts: 3,
  retryDelay: "10 millis",
  wait: "1 minute",
  cooldown: "1 minute",
})

export const failure = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isSuccess(exit)) throw new Error(`expected a failure, got ${String(exit.value)}`)
  const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
  if (!error) throw new Error(`expected a typed failure, got ${String(exit.cause)}`)
  return error
}
