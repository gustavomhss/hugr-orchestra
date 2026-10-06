/// <reference lib="esnext.disposable" />
// hugr-omni — public TypeScript surface. Copy of docs/api-contract.md §1 (W00), with one typing addition (W18b, lead
// decision): the type of the output follows `text`. `string` unless `text: false`, then `Uint8Array`; no runtime change.

/**
 * Runs a program to completion and returns its exit status with the complete output.
 * No shell is involved; the whole process tree is stopped on timeout, cancellation or output limit.
 * A non-zero exit resolves (`success: false`); it never throws.
 *
 * @example
 * const r = await run("git", ["status", "--short"], { timeoutMs: 10_000 });
 * if (!r.success) console.error(r.stderr);
 */
export function run(command: string, args?: readonly string[], options?: RunOptions & { text?: true }): Promise<RunResult<string>>;
export function run(command: string, args: readonly string[] | undefined, options: RunOptions & { text: false }): Promise<RunResult<Uint8Array>>;
export function run(command: string, args?: readonly string[], options?: RunOptions): Promise<RunResult>;

/**
 * Starts a program and returns at once; stream its output, write to it, wait for it, stop its whole tree.
 * Startup failures (not found, bad cwd, invalid option) are thrown synchronously as `OmniError`.
 *
 * @example
 * await using server = spawn("npm", ["run", "dev"]);
 * for await (const line of server.lines()) if (line.text.includes("ready")) break;
 * // leaving the scope awaits server.stop(): the dev server and everything it started are gone
 */
export function spawn(command: string, args?: readonly string[], options?: SpawnOptions & { pty?: undefined; text?: true }): PipeChild<string>;
export function spawn(command: string, args: readonly string[] | undefined, options: SpawnOptions & { pty?: undefined; text: false }): PipeChild<Uint8Array>;
export function spawn(command: string, args: readonly string[] | undefined, options: SpawnOptions & { pty: PtyOption; text?: true }): PtyChild<string>;
export function spawn(command: string, args: readonly string[] | undefined, options: SpawnOptions & { pty: PtyOption; text: false }): PtyChild<Uint8Array>;
// `text` known only at run time: the child kind still follows `pty`, and the data is either kind.
export function spawn(command: string, args: readonly string[] | undefined, options: SpawnOptions & { pty: PtyOption }): PtyChild;
export function spawn(command: string, args?: readonly string[], options?: SpawnOptions & { pty?: undefined }): PipeChild;
export function spawn(command: string, args?: readonly string[], options?: SpawnOptions): PipeChild | PtyChild;

export interface CommonOptions {
  /** Working directory (default: the host's). */
  cwd?: string;
  /** Merged over the inherited environment; `null` removes a variable. */
  env?: Record<string, string | null>;
  /** Default `true`; `false` = only `env` (plus the variables Windows requires). */
  inheritEnv?: boolean;
  /** Whole-run deadline; on expiry the tree is stopped and `reason` is `"timeout"`. */
  timeoutMs?: number;
  /** Default 2000: how long the tree gets to wind down when stopped. */
  graceMs?: number;
  /** Cancellation: the tree is stopped and `reason` is `"aborted"`. */
  signal?: AbortSignal;
  /** Default `true`: UTF-8 strings; `false`: `Uint8Array`, lossless. */
  text?: boolean;
  /** Pipe mode: stderr goes into the stdout pipe at the OS level (one chronological stream). */
  mergeStderr?: boolean;
}
export interface RunOptions extends CommonOptions {
  /** Pipe mode: fed to stdin, then stdin is closed. */
  input?: string | Uint8Array;
  /** Per stream, default 16 MiB; exceeding it stops the tree and rejects with `OUTPUT_LIMIT`. */
  maxOutputBytes?: number;
  /** Run inside a terminal. */
  pty?: PtyOption;
}
export interface SpawnOptions extends CommonOptions {
  /** Pipe mode only; default `"closed"` (end of input at once). */
  stdin?: "closed" | "pipe";
  /** Run inside a terminal; returns a `PtyChild`. */
  pty?: PtyOption;
}
/** `true` = 80 x 24. */
export type PtyOption = true | { cols?: number; rows?: number };

/**
 * What pipe and terminal children share. `D` is the type of the output data: `string`, or `Uint8Array` with `text: false`;
 * `spawn` picks it from `text`, and a bare `Child` is either.
 */
export interface Child<D = string | Uint8Array> extends AsyncDisposable {
  readonly pid: number;
  /** Single consumer: the first iteration claims it; leaving the loop detaches for good. */
  readonly output: AsyncIterable<Chunk<D>>;
  /** Line view of the same single consumer. */
  lines(): AsyncIterable<Line>;
  /** Bytes dropped because nobody was reading (terminal output counts as stdout). */
  readonly droppedBytes: { stdout: number; stderr: number };
  /** Resolves when the OS accepted the bytes. */
  write(data: string | Uint8Array): Promise<void>;
  /** Resolves when the root process exits; every call returns the same `Exit`. */
  wait(): Promise<Exit>;
  /** Ends the whole tree with one deadline (graceful, then forced after `graceMs`); resolves once it is gone. */
  stop(options?: { graceMs?: number }): Promise<Exit>;
  /** The live processes `stop()` would end right now; `[]` once the tree is gone. */
  processes(): Promise<ProcessInfo[]>;
}
export interface PipeChild<D = string | Uint8Array> extends Child<D> {
  /** Waits for queued writes, then closes stdin; idempotent. */
  closeStdin(): Promise<void>;
}
export interface PtyChild<D = string | Uint8Array> extends Child<D> {
  resize(cols: number, rows: number): void;
}

export interface Chunk<D = string | Uint8Array> { stream: "stdout" | "stderr" | "pty"; data: D; lostBefore?: number; }
export interface Line { stream: "stdout" | "stderr" | "pty"; text: string; lostBefore?: number; continues?: true; }
export interface ProcessInfo { pid: number; parentPid: number | null; name: string | null; }
export interface Exit {
  /** `null` only when a Unix process was ended by a signal. */
  exitCode: number | null;
  /** Unix signal name; always `null` on Windows. */
  signal: string | null;
  reason: "exit" | "signal" | "killed" | "timeout" | "aborted";
  /** `reason === "exit" && exitCode === 0`. */
  success: boolean;
}
/** `D` is `string`, or `Uint8Array` with `text: false`; `run` picks it from `text`, and a bare `RunResult` is either. */
export interface RunResult<D = string | Uint8Array> extends Exit {
  /** Complete; terminal output lands here. */
  stdout: D;
  /** Complete; empty for a terminal and with `mergeStderr`. */
  stderr: D;
}
export class OmniError extends Error {
  readonly code: "NOT_FOUND" | "NOT_EXECUTABLE" | "INVALID_CWD" | "INVALID_ARGUMENT"
               | "ABORTED" | "OUTPUT_LIMIT" | "CLOSED" | "IO";
  /** What `run()` collected, on `ABORTED` / `OUTPUT_LIMIT` / `IO`. */
  readonly result?: RunResult;
}
