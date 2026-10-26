import { describe, expect, test } from "bun:test"
import { BYTES_PER_MS, echoGate, interleave, ringBuffer } from "./live-audio"

const tone = (value: number, frames = 320) => new Float32Array(frames).fill(value)

describe("live audio", () => {
  test("interleaves me on the left and them on the right as PCM16", () => {
    // "them" stays under the speaking threshold, so "me" is not gated here.
    const pcm = interleave(tone(0.5, 2), tone(-0.005, 2), 0, echoGate())
    expect([...pcm]).toEqual([16384, -164, 16384, -164])
  })

  test("mutes me while them speaks and for the hangover after", () => {
    const gate = echoGate()
    expect(interleave(tone(0.5), tone(0.2), 0, gate)[0]).toBe(0)
    // 20 ms of them speaking ends at 20 ms; the 200 ms hangover keeps me muted until 220 ms.
    expect(interleave(tone(0.5), tone(0), 200, gate)[0]).toBe(0)
    expect(interleave(tone(0.5), tone(0), 220, gate)[0]).toBe(16384)
  })

  test("keeps me when them is quiet", () => {
    expect(interleave(tone(0.5), tone(0.001), 0, echoGate())[0]).toBe(16384)
  })

  test("ring buffer keeps the last window and serves chunks from a stream time", () => {
    const ring = ringBuffer(100)
    const chunk = () => new Int16Array((20 * BYTES_PER_MS) / 2)
    ;[0, 20, 40, 60, 80, 100, 120].forEach((startMs) => ring.push(startMs, chunk()))
    expect(ring.startMs()).toBe(40)
    expect(ring.since(90).map((item) => item.startMs)).toEqual([80, 100, 120])
  })
})
