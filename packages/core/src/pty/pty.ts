export type Disp = {
  dispose(): void
}

export type Exit = {
  exitCode: number
  signal?: number | string
}

export type Opts = {
  name: string
  cols?: number
  rows?: number
  cwd?: string
  env?: Record<string, string>
}

export type Proc = {
  pid: number
  onData(listener: (data: string) => void): Disp
  onExit(listener: (event: Exit) => void): Disp
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}

/** The largest terminal side a backend accepts (ConPTY's SHORT); every size is clamped to 1..SIZE_MAX (D-L7). */
export const SIZE_MAX = 32767

export function clampSize(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(SIZE_MAX, Math.max(1, Math.trunc(value)))
}
