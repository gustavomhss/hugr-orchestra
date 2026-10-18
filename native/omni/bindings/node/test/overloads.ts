// C-TS-01, the types an idiom relies on: the PipeChild / PtyChild overloads, the type of the output by `text` (`string`
// unless `text: false`), `OmniError.code` as a closed set, the `reason` union and `await using` / `for await` on a Child. Checked by `tsc -p test/tsconfig.json` against the frozen
// index.d.ts; nothing here runs. A `@ts-expect-error` that stops being an error is itself an error, so every line that
// says "wrong" can fail.
import { OmniError, run, spawn, type Child, type Exit, type PipeChild, type PtyChild, type RunResult, type SpawnOptions } from "hugr-omni";

declare const options: SpawnOptions;
declare const flag: boolean;
declare const err: OmniError;

const pipe: PipeChild = spawn("x");
const piped: PipeChild = spawn("x", ["y"], { stdin: "pipe" });
const pty: PtyChild = spawn("x", [], { pty: true });
const sized: PtyChild = spawn("x", undefined, { pty: { cols: 100, rows: 30 } });
const either: PipeChild | PtyChild = spawn("x", [], options);
const shared: Child = pty;
const result: Promise<RunResult> = run("x", ["y"], { pty: true, timeoutMs: 1 });

void pipe.closeStdin();
pty.resize(80, 24);

// @ts-expect-error a pipe child has no resize
pipe.resize(80, 24);
// @ts-expect-error a terminal has no closeStdin
pty.closeStdin();
// @ts-expect-error `pty` never gives a PipeChild
const notPipe: PipeChild = spawn("x", [], { pty: true });
// @ts-expect-error `stdin` is a spawn option, not a run option
void run("x", [], { stdin: "pipe" });
// @ts-expect-error `input` is a run option, not a spawn option
spawn("x", [], { input: "x" });

// The output follows `text`: strings by default (omitted or `true`), `Uint8Array` with `text: false`, either when it is
// only known at run time.
const textual = await run("x");
const trimmed: string = textual.stdout.trim() + textual.stderr.trim();
const explicit: RunResult<string> = await run("x", [], { text: true, timeoutMs: 1 });
const bytes = await run("x", [], { text: false });
const raw: Uint8Array = bytes.stdout;
const dynamic = await run("x", [], { text: flag });
const eitherData: string | Uint8Array = dynamic.stdout;
// @ts-expect-error bytes are not text: no `trim`
bytes.stdout.trim();
// @ts-expect-error `text` is only known at run time: narrow it first
dynamic.stdout.trim();
// @ts-expect-error a text result is not bytes
const notBytes: Uint8Array = textual.stdout;

const pipeText = spawn("x");
const pipeBytes = spawn("x", [], { text: false });
const ptyText = spawn("x", [], { pty: true });
const ptyBytes = spawn("x", [], { pty: { cols: 100 }, text: false });
const sizedBytes: PtyChild<Uint8Array> = ptyBytes;
const asChild: Child = pipeBytes;
for await (const chunk of pipeText.output) void chunk.data.trim();
for await (const chunk of ptyText.output) void chunk.data.trim();
for await (const chunk of pipeBytes.output) {
  const data: Uint8Array = chunk.data;
  void data;
  // @ts-expect-error bytes are not text: no `trim`
  chunk.data.trim();
  break;
}
for await (const chunk of ptyBytes.output) {
  const data: Uint8Array = chunk.data;
  void data;
  break;
}
// @ts-expect-error a terminal with `text: false` still has no closeStdin
ptyBytes.closeStdin();

// A `text` known only at run time still picks pipe or terminal by `pty`: the data is either kind, the child is the right one.
const pipeDynamic = spawn("x", [], { stdin: "pipe", text: flag });
void pipeDynamic.closeStdin();
const ptyDynamic = spawn("x", [], { pty: true, text: flag });
ptyDynamic.resize(80, 24);
const dynamicData: string | Uint8Array | undefined = (await ptyDynamic.output[Symbol.asyncIterator]().next()).value?.data;
// @ts-expect-error a pipe child has no resize, whatever `text` is
pipeDynamic.resize(80, 24);
// @ts-expect-error a terminal has no closeStdin, whatever `text` is
ptyDynamic.closeStdin();

const code: "NOT_FOUND" | "NOT_EXECUTABLE" | "INVALID_CWD" | "INVALID_ARGUMENT" | "ABORTED" | "OUTPUT_LIMIT" | "CLOSED" | "IO" = err.code;
// @ts-expect-error the codes are a closed set
const closed: "NOPE" = err.code;
const asError: Error = err;
const partial: RunResult | undefined = err.result;

function reasonText(reason: Exit["reason"]): string {
  switch (reason) {
    case "exit":
    case "signal":
    case "killed":
    case "timeout":
    case "aborted":
      return reason;
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

await using scoped = spawn("x");
const disposable: AsyncDisposable = scoped;
for await (const chunk of scoped.output) {
  const stream: "stdout" | "stderr" | "pty" = chunk.stream;
  void stream;
  break;
}
for await (const line of scoped.lines()) {
  const text: string = line.text;
  void text;
  break;
}

export { code, asError, partial, reasonText, piped, sized, either, shared, result, notPipe, closed, disposable };
export { trimmed, explicit, raw, eitherData, notBytes, sizedBytes, asChild, dynamicData };
