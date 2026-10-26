import { describe, expect, test } from "bun:test"
import { segmenter, type Caption, type Segment } from "./live-segmenter"

const piece = (text: string, startMs: number, endMs: number, final = true) =>
  ({ track: "me", text, startMs, endMs, final }) as const

function record(endOfSpeech: boolean) {
  const segments: Segment[] = []
  const captions: Caption[] = []
  const cutter = segmenter({ endOfSpeech, onSegment: (s) => segments.push(s), onCaption: (c) => captions.push(c) })
  return { cutter, segments, captions }
}

describe("live segmenter", () => {
  test("joins finals into one segment closed by end of speech", () => {
    const run = record(true)
    run.cutter.piece(piece("hello", 0, 400), 400)
    run.cutter.piece(piece("there", 400, 900, false), 900)
    run.cutter.piece(piece("there.", 400, 1000), 1000)
    run.cutter.tick(10_000)
    expect(run.segments).toEqual([])
    run.cutter.speechEnd("me")
    expect(run.segments).toEqual([{ track: "me", text: "hello there.", startMs: 0, endMs: 1000 }])
    expect(run.captions[1]).toEqual({ track: "me", text: "hello", partial: "there" })
    expect(run.captions.at(-1)).toEqual({ track: "me", text: "", partial: "" })
  })

  test("without end of speech, closes 700 ms after a sentence end and 1500 ms otherwise", () => {
    const run = record(false)
    run.cutter.piece(piece("Done.", 0, 500), 500)
    run.cutter.tick(1100)
    expect(run.segments).toHaveLength(0)
    run.cutter.tick(1200)
    expect(run.segments).toHaveLength(1)
    run.cutter.piece(piece("and then", 2000, 2500), 2500)
    run.cutter.tick(3900)
    expect(run.segments).toHaveLength(1)
    run.cutter.tick(4000)
    expect(run.segments.at(-1)?.text).toBe("and then")
  })

  test("force-cuts a segment at 30 seconds", () => {
    const run = record(true)
    run.cutter.piece(piece("long", 0, 29_000), 29_000)
    expect(run.segments).toHaveLength(0)
    run.cutter.piece(piece("talk", 29_000, 30_000), 30_000)
    expect(run.segments).toEqual([{ track: "me", text: "long talk", startMs: 0, endMs: 30_000 }])
  })

  test("flush closes open segments and drops partial-only ones", () => {
    const run = record(true)
    run.cutter.piece(piece("said", 0, 300), 300)
    run.cutter.piece({ track: "them", text: "maybe", startMs: 0, endMs: 300, final: false }, 300)
    run.cutter.flush()
    expect(run.segments.map((s) => s.track)).toEqual(["me"])
  })
})
