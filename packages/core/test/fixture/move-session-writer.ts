export * as MoveSessionWriter from "./move-session-writer"

import { watch } from "node:fs"
import fs from "fs/promises"
import path from "path"
import { Effect, Fiber, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../src/process"

export const contents = {
  "tracked.txt": "writer tracked\n",
  "untracked.txt": "writer captured untracked\n",
  "late.txt": "writer new untracked\n",
  "renamed.txt": "writer rename replacement\n",
  "open-fd.txt": "writer already-open descriptor\n",
}

export const start = Effect.fn("MoveSessionWriter.start")(function* (source: string, control: string) {
  const processes = yield* AppProcess.Service
  yield* Effect.promise(() => Bun.write(path.join(control, "actor.mjs"), actor))
  const child = yield* processes.run(ChildProcess.make(process.execPath,
    [path.join(control, "actor.mjs"), source, control],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" }), { timeout: "30 seconds" }).pipe(Effect.forkScoped)
  const ready = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({
    pid: Schema.Number, descriptorOpen: Schema.Literal(true),
  })))(yield* Effect.raceFirst(
    waitForFile(path.join(control, "READY")),
    Fiber.join(child).pipe(Effect.flatMap(AppProcess.requireSuccess),
      Effect.andThen(Effect.die(new Error("Writer exited before READY")))),
  ))
  return {
    ready,
    release: Effect.gen(function* () {
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(control, "release.tmp"), "MOVED", { flag: "wx" })
        await fs.rename(path.join(control, "release.tmp"), path.join(control, "release"))
      })
      // Successful exit follows the actor's atomic ACK publication; surface child failures before reading its proof.
      const result = yield* Fiber.join(child).pipe(Effect.timeout("20 seconds"), Effect.flatMap(AppProcess.requireSuccess))
      const ack = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({
        pid: Schema.Number, writes: Schema.Literal(5), descriptorClosed: Schema.Literal(true),
      })))(yield* Effect.promise(() => fs.readFile(path.join(control, "ACK"), "utf8")))
      return { ack, exitCode: result.exitCode }
    }),
  }
})

// Watch before checking the file, so an already-published acknowledgement cannot fall between those steps.
function waitForFile(file: string) {
  return Effect.callback<string>((resume) => {
    const state = { done: false, cleanup: undefined as Promise<void> | undefined }
    const controller = new AbortController()
    const pending = new Set<Promise<void>>()
    const closed = Promise.withResolvers<void>()
    const cleanup = () => state.cleanup ??= (async () => {
      clearTimeout(timer)
      watcher.close()
      controller.abort()
      await closed.promise
      await Promise.allSettled(pending)
    })()
    const finish = (error?: unknown, value?: string) => {
      if (state.done) return
      state.done = true
      void cleanup().then(
        () => resume(error === undefined ? Effect.succeed(value ?? "") : Effect.die(error)),
        (cause: unknown) => resume(Effect.die(cause)),
      )
    }
    const check = () => {
      if (state.done) return
      const read = fs.readFile(file, { encoding: "utf8", signal: controller.signal })
        .then((value) => finish(undefined, value), (error: unknown) => {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return
          finish(error)
        }).finally(() => { pending.delete(read) })
      pending.add(read)
    }
    const watcher = watch(path.dirname(file), check)
    watcher.once("close", () => closed.resolve())
    const timer = setTimeout(() => finish(new Error(`Writer acknowledgement timed out: ${path.basename(file)}`)), 20_000)
    watcher.on("error", finish)
    check()
    // Effect joins this cancellation finalizer before the enclosing fixture can remove its directory.
    return Effect.promise(() => {
      state.done = true
      return cleanup()
    })
  })
}

// Fixed actor: only fixture-owned paths are arguments. No caller supplies code or a success verdict.
const actor = String.raw`import assert from "node:assert/strict";
import { watch } from "node:fs";
import { open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
const [source, control] = process.argv.slice(2);
const descriptor = await open(path.join(source, "open-fd.txt"), "r+");
async function publish(name, value) {
  await writeFile(path.join(control, name + ".tmp"), value, { flag: "wx" });
  await rename(path.join(control, name + ".tmp"), path.join(control, name));
}
const released = new Promise((resolve, reject) => {
  const state = { done: false };
  const finish = (error) => {
    if (state.done) return;
    state.done = true;
    clearTimeout(timer);
    watcher.close();
    if (error) reject(error);
    else resolve();
  };
  const check = () => {
    void readFile(path.join(control, "release"), "utf8").then((value) => {
      assert.equal(value, "MOVED");
      finish();
    }, (error) => { if (error.code !== "ENOENT") finish(error); }).catch(finish);
  };
  const watcher = watch(control, check);
  const timer = setTimeout(() => finish(new Error("Writer release was not acknowledged")), 20000);
  watcher.on("error", finish);
  check();
});
await publish("READY", JSON.stringify({ pid: process.pid, descriptorOpen: true }));
await released;
await writeFile(path.join(source, "tracked.txt"), "writer tracked\n");
await writeFile(path.join(source, "untracked.txt"), "writer captured untracked\n");
await writeFile(path.join(source, "late.txt"), "writer new untracked\n");
await writeFile(path.join(control, "replacement"), "writer rename replacement\n");
await rename(path.join(control, "replacement"), path.join(source, "renamed.txt"));
await descriptor.truncate(0);
await descriptor.writeFile("writer already-open descriptor\n");
await descriptor.sync();
await descriptor.close();
await publish("ACK", JSON.stringify({ pid: process.pid, writes: 5, descriptorClosed: true }));
`
