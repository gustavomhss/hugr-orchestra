import { afterEach, describe, expect, test } from "bun:test"
import { backdropDismiss, outsideBox } from "./dialog-backdrop"

type Pointer = PointerEvent & { currentTarget: HTMLDialogElement }
type Click = MouseEvent & { currentTarget: HTMLDialogElement }

// happy-dom lays nothing out, so every element's box is 0x0 at the origin: (0, 0) is on the box edge (inside) and any
// other point is outside it. That is enough to tell a backdrop press from a press inside the dialog.
const inside = { clientX: 0, clientY: 0 }
const outside = { clientX: 40, clientY: 40 }

function mount() {
  const dialog = document.createElement("dialog")
  const field = document.createElement("input")
  dialog.append(field)
  document.body.append(dialog)
  const dismissed: HTMLDialogElement[] = []
  const handlers = backdropDismiss((target) => dismissed.push(target))
  dialog.addEventListener("pointerdown", (event) => handlers.onPointerDown(event as Pointer))
  dialog.addEventListener("click", (event) => handlers.onClick(event as Click))
  const press = (target: Element, point: { clientX: number; clientY: number }) =>
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ...point }))
  const release = (target: Element, point: { clientX: number; clientY: number }) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, ...point }))
  return { dialog, field, dismissed, press, release }
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("outsideBox", () => {
  const box = { left: 10, right: 20, top: 10, bottom: 20 }
  test("a point on the edge is inside, any point past it is outside", () => {
    expect(outsideBox(box, 10, 10)).toBe(false)
    expect(outsideBox(box, 20, 20)).toBe(false)
    expect(outsideBox(box, 9, 15)).toBe(true)
    expect(outsideBox(box, 21, 15)).toBe(true)
    expect(outsideBox(box, 15, 9)).toBe(true)
    expect(outsideBox(box, 15, 21)).toBe(true)
  })
})

describe("backdropDismiss", () => {
  test("a press and a release on the backdrop dismisses", () => {
    const view = mount()
    view.press(view.dialog, outside)
    view.release(view.dialog, outside)
    expect(view.dismissed).toEqual([view.dialog])
  })

  test("a drag-select that starts in a field and ends on the backdrop does not dismiss", () => {
    const view = mount()
    view.press(view.field, inside)
    // The browser fires the click on the common ancestor of both ends: the dialog itself.
    view.release(view.dialog, outside)
    expect(view.dismissed).toEqual([])
  })

  test("a press on the dialog box released on the backdrop does not dismiss", () => {
    const view = mount()
    view.press(view.dialog, inside)
    view.release(view.dialog, outside)
    expect(view.dismissed).toEqual([])
  })

  test("a click inside the box does not dismiss", () => {
    const view = mount()
    view.press(view.dialog, inside)
    view.release(view.dialog, inside)
    view.press(view.field, inside)
    view.release(view.field, inside)
    expect(view.dismissed).toEqual([])
  })

  test("a click without a press on the backdrop does not dismiss", () => {
    const view = mount()
    view.release(view.dialog, outside)
    expect(view.dismissed).toEqual([])
  })

  test("one press arms one click", () => {
    const view = mount()
    view.press(view.dialog, outside)
    view.release(view.dialog, outside)
    view.release(view.dialog, outside)
    expect(view.dismissed).toHaveLength(1)
  })

  test("a later press elsewhere disarms an earlier backdrop press", () => {
    const view = mount()
    view.press(view.dialog, outside)
    view.press(view.field, inside)
    view.release(view.dialog, outside)
    expect(view.dismissed).toEqual([])
  })
})
