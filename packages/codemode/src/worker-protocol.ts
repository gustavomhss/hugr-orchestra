import type { Result } from "./codemode.js"
import type { ToolRuntimeError } from "./tool-runtime.js"

export type NamespaceSnapshot = ReadonlyArray<{
  readonly path: ReadonlyArray<string>
  readonly keys: ReadonlyArray<string>
}>

export type ToolFailure =
  | { readonly type: "runtime"; readonly kind: ToolRuntimeError["kind"]; readonly message: string; readonly suggestions: ReadonlyArray<string> }
  | { readonly type: "tool"; readonly message: string }
  | { readonly type: "execution"; readonly message: string }

export type WorkerCommand =
  | { readonly type: "start"; readonly code: string; readonly namespaces: NamespaceSnapshot; readonly maxOutputBytes: number | undefined }
  | { readonly type: "tool-result"; readonly id: number; readonly result: { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: ToolFailure } }
  | { readonly type: "cancelled"; readonly id: number }

export type WorkerSignal =
  | { readonly type: "ready" }
  | { readonly type: "interrupted" }
  | { readonly type: "invoke"; readonly id: number; readonly path: ReadonlyArray<string>; readonly args: ReadonlyArray<unknown> }
  | { readonly type: "cancel"; readonly id: number }
  | { readonly type: "log"; readonly line: string }
  | { readonly type: "done"; readonly result: Result }
