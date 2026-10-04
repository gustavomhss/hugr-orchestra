import { expect, type Locator } from "@playwright/test"

// Horizontal extent of every character of the element's first text node, as painted.
export async function glyphs(locator: Locator) {
  return locator.evaluate((element) => {
    const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode() as Text
    return Array.from({ length: node.length }, (_, index) => {
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      const box = range.getBoundingClientRect()
      return { left: box.left, right: box.right }
    })
  })
}

// A trailing mark of an English run sits after its last letter, to the right.
export function expectTrailing(boxes: { left: number; right: number }[], index: number) {
  expect(boxes[index]!.left).toBeGreaterThanOrEqual(boxes[index - 1]!.right - 0.5)
}

// A leading mark of an English run sits before its first letter, to the left.
export function expectLeading(boxes: { left: number; right: number }[]) {
  expect(boxes[0]!.right).toBeLessThanOrEqual(boxes[1]!.left + 0.5)
}

// Every painted line starts at the slot's inline-start edge for the document direction.
export async function expectStartAligned(locator: Locator, direction: "ltr" | "rtl") {
  const result = await locator.evaluate((element, direction) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const edge =
      direction === "rtl"
        ? box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
        : box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
    // A line can paint as several bidi runs; its start is the outermost run on that side.
    const lines = Map.groupBy(
      [...range.getClientRects()].filter((rect) => rect.width > 0),
      (rect) => Math.round(rect.top),
    )
    return [...lines.values()].map((rects) =>
      Math.abs(
        direction === "rtl"
          ? Math.max(...rects.map((rect) => rect.right)) - edge
          : Math.min(...rects.map((rect) => rect.left)) - edge,
      ),
    )
  }, direction)
  expect(result.length).toBeGreaterThan(0)
  for (const offset of result) expect(offset).toBeLessThanOrEqual(1)
}
