import { expect, test } from "bun:test"
import {
  clampPosition,
  defaultPosition,
  initialState,
  LIVE_OVERLAY_MARGIN,
  pageAnswers,
  pushAnswer,
  streamAnswer,
  windowHeight,
  windowWidth,
} from "./live-overlay-state"

const workArea = { x: 0, y: 25, width: 1440, height: 875 }
const answer = (lead: string) => ({ lead, points: [], latencyMs: 1200 })

test("a new answer becomes the current page and paging stops at both ends", () => {
  const state = [answer("a"), answer("b"), answer("c")].reduce(pushAnswer, initialState(true))
  expect(state.answerIndex).toBe(2)
  expect(pageAnswers(state, 1).answerIndex).toBe(2)
  expect(pageAnswers(pageAnswers(state, -1), -1).answerIndex).toBe(0)
  expect(pageAnswers(pageAnswers(pageAnswers(state, -1), -1), -1).answerIndex).toBe(0)
})

test("a streamed answer grows in place and pushing it ends the stream on the same page", () => {
  const first = pushAnswer(initialState(true), answer("a"))
  const streamed = [answer("b"), answer("bc")].reduce(streamAnswer, first)
  expect(streamed.answers.map((item) => item.lead)).toEqual(["a", "bc"])
  expect(streamed.answerIndex).toBe(1)
  const paged = pageAnswers(streamed, -1)
  const done = pushAnswer(paged, answer("bcd"))
  expect(done.answers.map((item) => item.lead)).toEqual(["a", "bcd"])
  expect(done.answers[1].streaming).toBeUndefined()
  expect(done.answerIndex).toBe(0)
  expect(pushAnswer(done, answer("e")).answers).toHaveLength(3)
})

test("paging with no answers leaves the view alone", () => {
  const state = initialState(true)
  expect(pageAnswers(state, -1)).toBe(state)
})

test("the default position centres the bar under the menu bar", () => {
  const position = defaultPosition(workArea)
  expect(position.x + LIVE_OVERLAY_MARGIN + 300).toBe(720)
  expect(position.y + LIVE_OVERLAY_MARGIN).toBe(59)
})

test("clamping keeps the glass, not the shadow margin, inside the work area", () => {
  const height = windowHeight(54)
  expect(clampPosition({ x: -500, y: -500 }, height, workArea)).toEqual({ x: -LIVE_OVERLAY_MARGIN, y: 25 - LIVE_OVERLAY_MARGIN })
  expect(clampPosition({ x: 5000, y: 5000 }, height, workArea)).toEqual({
    x: 1440 - windowWidth() + LIVE_OVERLAY_MARGIN,
    y: 900 - height + LIVE_OVERLAY_MARGIN,
  })
})
