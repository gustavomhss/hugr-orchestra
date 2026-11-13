import type { Capture, Match, Replacement } from "./native-regex.js"

export function fromWireCapture(_value: Capture): string | undefined {
  throw new Error("Native regex capture codec is not implemented")
}

export function fromWireMatch(_value: Match): Array<unknown> {
  throw new Error("Native regex match codec is not implemented")
}

export function replacementArgs(_value: Replacement, _subject: string): Array<unknown> {
  throw new Error("Native regex replacement codec is not implemented")
}
