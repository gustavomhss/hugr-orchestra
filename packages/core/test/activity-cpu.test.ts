import { expect, test } from "bun:test"
import { make, reading } from "../src/activity-cpu"

const sample = (idle: number, user: number, at: number) => ({
  cpus: [{ model: "fixture", times: { idle, user, nice: 0, sys: 0, irq: 0 } }],
  monotonic: at,
  sampledAt: 1000 + at,
})

test("CPU requires two readings with a positive counter window", () => {
  expect(reading(undefined, sample(700, 300, 1000))).toBeUndefined()
  expect(reading(sample(700, 300, 0), sample(700, 300, 1000))).toBeUndefined()
  expect(reading(sample(0, 0, 0), sample(700, 300, 100))).toBeUndefined()
  expect(reading(sample(0, 0, 1000), sample(700, 300, 0))).toBeUndefined()
})

test("CPU uses reported time deltas with a named source and measured window", () => {
  expect(reading(sample(7000, 3000, 1000), sample(7700, 3300, 2000))).toEqual({
    source: "node.os.cpus",
    percent: 30,
    windowMs: 1000,
    sampledAt: 3000,
  })
  expect(reading(sample(0, 0, 0), sample(1000, 0, 1000))?.percent).toBe(0)
  expect(reading(sample(0, 0, 0), sample(0, 1000, 1000))?.percent).toBe(100)
  expect(reading(sample(0, 0, 0), sample(0, 1e300, 1000))?.percent).toBe(100)
})

test("machine percentage is weighted by reported CPU time, not an average of core percentages", () => {
  const previous = sample(0, 0, 0)
  const current = sample(1000, 0, 1000)
  previous.cpus.push(sample(0, 0, 0).cpus[0]!)
  current.cpus.push(sample(0, 3000, 1000).cpus[0]!)
  expect(reading(previous, current)?.percent).toBe(75)
})

test("missing CPUs, counter resets, topology changes and invalid counters stay unread", () => {
  expect(reading(sample(10, 10, 0), sample(1, 1, 1000))).toBeUndefined()
  expect(reading(sample(0, 0, 0), { ...sample(1, 1, 1000), cpus: [] })).toBeUndefined()
  expect(
    reading(sample(0, 0, 0), { ...sample(1, 1, 1000), cpus: [...sample(1, 1, 1000).cpus, ...sample(1, 1, 1000).cpus] }),
  ).toBeUndefined()
  expect(reading(sample(0, 0, 0), sample(NaN, 100, 1000))).toBeUndefined()
  expect(reading(sample(0, 0, 0), sample(Infinity, 100, 1000))).toBeUndefined()
  expect(
    reading(sample(0, 0, 0), {
      ...sample(100, 100, 1000),
      cpus: [{ ...sample(100, 100, 1000).cpus[0]!, model: "changed" }],
    }),
  ).toBeUndefined()
})

test("sampler retains the last valid timestamp and does not shorten its window for concurrent readers", () => {
  const samples = [
    sample(0, 0, 0),
    sample(70, 30, 100),
    sample(700, 300, 1000),
    sample(1, 1, 2000),
    sample(1001, 1, 3000),
  ]
  const next = make(() => {
    const value = samples.shift()
    if (!value) throw new Error("counter fixture exhausted")
    return value
  })
  expect(next()).toBeUndefined()
  expect(next()).toBeUndefined()
  const first = next()
  expect(first?.percent).toBe(30)
  expect(first?.windowMs).toBe(1000)
  expect(next()).toEqual(first)
  expect(next()).toEqual({ source: "node.os.cpus", percent: 0, windowMs: 1000, sampledAt: 4000 })
})
