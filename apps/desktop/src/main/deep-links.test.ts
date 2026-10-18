import { expect, test } from "bun:test"
import { createDeepLinkDelivery } from "./deep-links"

test("desktop recovery: argv links wait for readiness; delivered links never replay on reload", () => {
  const sent: unknown[] = []
  const first = "orchestra://open-project?directory=/repo"
  const second = "orchestra://new-session?directory=/repo"
  const queue = createDeepLinkDelivery(["electron", "main.js", first], (target, urls) => sent.push([target, urls]))
  queue.enqueue([second], 1)
  expect(sent).toEqual([])
  expect(queue.consume(1)).toEqual([first, second])
  queue.enqueue([first], 1)
  expect(sent).toEqual([[1, [first]]])
  expect(queue.consume(1)).toEqual([])
  queue.pause(1)
  queue.enqueue([second], 1)
  expect(queue.consume(2)).toEqual([second])
  expect(queue.consume(1)).toEqual([])
})
