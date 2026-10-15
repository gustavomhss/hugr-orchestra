import { expect, type Locator } from "@playwright/test"

type Box = { left: number; right: number }

// Horizontal extent of every character of the element's text, as painted, indexed like textContent.
export async function glyphs(locator: Locator) {
  return locator.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    return nodes.flatMap((node) =>
      Array.from({ length: node.length }, (_, index) => {
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + 1)
        const box = range.getBoundingClientRect()
        return { left: box.left, right: box.right }
      }),
    )
  })
}

// The characters at these indexes are painted from left to right, as an English run reads.
export function expectInOrder(boxes: Box[], ...indexes: number[]) {
  // A hidden or unpainted character has an empty box, which would satisfy any order.
  for (const index of indexes) expect(boxes[index]!.right).toBeGreaterThan(boxes[index]!.left)
  for (const [index, next] of indexes.slice(1).entries())
    expect(boxes[next]!.left).toBeGreaterThanOrEqual(boxes[indexes[index]!]!.right - 0.5)
}

// The closing mark of `text` paints after its last letter, at the inline end of the English run.
export function expectTrailing(boxes: Box[], text: string) {
  expectInOrder(boxes, text.length - 2, text.length - 1)
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
