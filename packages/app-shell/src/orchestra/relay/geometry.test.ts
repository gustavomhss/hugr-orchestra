import { describe, expect, test } from "bun:test"
import {
  bounds,
  centerOn,
  contains,
  DRAWER,
  edgePath,
  fitView,
  groupRect,
  intersects,
  minimapPoint,
  neighbour,
  NODE,
  nudge,
  popupAt,
  portY,
  rounded,
  snap,
  toWorld,
  viewInset,
  wheelFactor,
  zoomAt,
} from "./geometry"

describe("ports and groups", () => {
  test("ports sit on the vertical centre, or at 18 and 38 for two outputs", () => {
    expect(portY({ x: 0, y: 100 }, 0, 1)).toBe(128)
    expect(portY({ x: 0, y: 100 }, 0, 2)).toBe(118)
    expect(portY({ x: 0, y: 100 }, 1, 2)).toBe(138)
  })

  test("a phase box leaves room for its header above and the labels below", () => {
    expect(groupRect([])).toBeUndefined()
    expect(
      groupRect([
        { x: 240, y: 132 },
        { x: 376, y: 132 },
      ]),
    ).toEqual({ x: 200, y: 60, w: 136 + NODE + 80, h: NODE + 118 })
  })

  test("snaps to the 8px grid", () => {
    expect([snap(3), snap(4), snap(-5), snap(130)]).toEqual([0, 8, -8, 128])
  })
})

describe("wires", () => {
  test("a forward wire is one S-curve from the output port to the input port", () => {
    const path = edgePath({ from: { x: 0, y: 0 }, to: { x: 200, y: 40 }, port: 0, outputs: 1 })
    expect(path.back).toBe(false)
    expect(path.d).toBe(`M${NODE} 28 C128 28 128 68 200 68`)
    expect([path.mx, path.my]).toEqual([(NODE + 200) / 2, 48])
  })

  test("a wire into the next row runs through the gap between the two phase boxes", () => {
    const fromGroup = { x: 800, y: 60, w: 400, h: 174 }
    const toGroup = { x: 200, y: 300, w: 400, h: 174 }
    const path = edgePath({
      from: { x: 1100, y: 132 },
      to: { x: 240, y: 372 },
      port: 0,
      outputs: 1,
      fromGroup,
      toGroup,
    })
    expect(path.back).toBe(true)
    expect(path.my).toBe((60 + 174 + 300) / 2)
    expect(path.d.startsWith(`M${1100 + NODE} 160 L`)).toBe(true)
    expect(path.d.endsWith("L240 400")).toBe(true)
    // The return route leaves right of the source box and enters left of the target box.
    expect(path.d).toContain(`${800 + 400 + 12}`)
    expect(path.d).toContain(`${200 - 12}`)
  })

  test("rounded corners never exceed half of either adjacent segment", () => {
    expect(
      rounded(
        [
          [0, 0],
          [4, 0],
          [4, 10],
        ],
        10,
      ),
    ).toBe("M0 0 L2 0 Q4 0 4 2 L4 10")
  })
})

describe("view", () => {
  test("fit centres the content inside the free area and never zooms past 100%", () => {
    const view = fitView(
      { x: 0, y: 0, w: 200, h: 100 },
      { w: 1000, h: 800 },
      { left: 30, top: 64, right: 30, bottom: 126 },
    )
    expect(view.k).toBe(1)
    expect(view.x).toBe(30 + (940 - 200) / 2)
    expect(view.y).toBe(64 + (610 - 100) / 2)
    const tight = fitView(
      { x: 100, y: 0, w: 4000, h: 1000 },
      { w: 1000, h: 800 },
      { left: 0, top: 0, right: 0, bottom: 0 },
    )
    expect(tight.k).toBe(0.3)
  })

  test("zoom keeps the point under the cursor fixed and clamps between 30% and 200%", () => {
    const view = { k: 1, x: 10, y: 20 }
    const zoomed = zoomAt(view, 2, 110, 120)
    expect(zoomed.k).toBe(2)
    expect(toWorld(zoomed, 110, 120)).toEqual(toWorld(view, 110, 120))
    expect(zoomAt(view, 100, 0, 0).k).toBe(2)
    expect(zoomAt(view, 0.01, 0, 0).k).toBe(0.3)
  })

  test("centring puts the node's middle in the middle of the viewport", () => {
    const view = centerOn({ k: 0.5, x: 0, y: 0 }, { x: 100, y: 200 }, { w: 800, h: 600 })
    expect(view.x + (100 + NODE / 2) * 0.5).toBe(400)
    expect(view.y + (200 + NODE / 2) * 0.5).toBe(300)
  })

  test("content bounds cover labels below and headers above", () => {
    expect(bounds([])).toEqual({ x: 0, y: 0, w: 400, h: 300 })
    expect(bounds([{ x: 100, y: 100 }])).toEqual({ x: 70, y: 20, w: 30 + NODE + 40, h: 80 + NODE + 50 })
  })

  test("a minimap click maps back to the world point under it", () => {
    const box = { x: 0, y: 0, w: 1000, h: 500 }
    expect(minimapPoint(box, { w: 200, h: 100 }, { x: 100, y: 50 })).toEqual({ x: 500, y: 250 })
    // Letterboxed: a taller minimap centres the content vertically.
    expect(minimapPoint(box, { w: 200, h: 200 }, { x: 0, y: 50 })).toEqual({ x: 0, y: 0 })
  })

  test("box selection includes nodes that touch the box", () => {
    expect(intersects({ x: 0, y: 0 }, { x: 50, y: 50, w: 10, h: 10 })).toBe(true)
    expect(intersects({ x: 0, y: 0 }, { x: 56, y: 0, w: 10, h: 10 })).toBe(false)
  })

  test("the add drawer's room is reserved on the side where the drawer is", () => {
    expect(viewInset(false, false)).toEqual({ left: 30, top: 64, right: 30, bottom: 126 })
    expect(viewInset(true, false)).toEqual({ left: 30, top: 64, right: 30 + DRAWER, bottom: 126 })
    // In a right-to-left UI the drawer is on the left, and so is the reserve.
    expect(viewInset(true, true)).toEqual({ left: 30 + DRAWER, top: 64, right: 30, bottom: 126 })
  })

  test("centring in what a left-hand drawer leaves free starts after the drawer", () => {
    const view = centerOn({ k: 1, x: 0, y: 0 }, { x: 100, y: 200 }, { x: DRAWER, w: 800 - DRAWER, h: 600 })
    expect(view.x + 100 + NODE / 2).toBe(DRAWER + (800 - DRAWER) / 2)
  })

  test("one wheel event zooms by at most 10%, however far the wheel turned", () => {
    expect(wheelFactor(100)).toBe(0.9)
    expect(wheelFactor(-100)).toBe(1.1)
    expect(wheelFactor(0)).toBe(1)
    expect(wheelFactor(4)).toBeCloseTo(Math.exp(-0.04), 10)
    expect(zoomAt({ k: 1, x: 0, y: 0 }, wheelFactor(-1000), 0, 0).k).toBeCloseTo(1.1, 10)
  })

  test("a span moves just far enough to sit inside the room, or lines up its start when it is wider", () => {
    expect(nudge(10, 50, 0, 100)).toBe(0)
    expect(nudge(-20, 20, 0, 100)).toBe(20)
    expect(nudge(80, 130, 0, 100)).toBe(-30)
    expect(nudge(-50, 300, 0, 100)).toBe(50)
    expect(contains({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 5 })).toBe(true)
    expect(contains({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 5 })).toBe(false)
  })
})

describe("popups", () => {
  const area = { w: 1000, h: 600 }
  const size = { w: 200, h: 150 }

  test("a popup opens below its button, or above it when there is no room below", () => {
    expect(popupAt({ x: 100, top: 20, bottom: 50 }, size, area)).toEqual({ x: 100, y: 56 })
    expect(popupAt({ x: 100, top: 540, bottom: 570 }, size, area)).toEqual({ x: 100, y: 384 })
  })

  test("a popup that fits neither way is pinned inside the window, and never leaves it sideways", () => {
    expect(popupAt({ x: 100, top: 200, bottom: 230 }, { w: 200, h: 560 }, area)).toEqual({ x: 100, y: 32 })
    expect(popupAt({ x: 950, top: 20, bottom: 50 }, size, area).x).toBe(792)
    expect(popupAt({ x: -40, top: 20, bottom: 50 }, size, area).x).toBe(8)
  })
})

describe("arrow keys between steps", () => {
  const nodes = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 136, y: 0 },
    { id: "c", x: 136, y: 140 },
    { id: "loose", x: 400, y: 4 },
  ]
  const edges = [
    { from: "a", to: "b", port: 0 },
    { from: "a", to: "c", port: 1 },
  ]

  test("they follow the wires first, and Down takes the lower output", () => {
    expect(neighbour(nodes, edges, "a", "right")).toBe("b")
    expect(neighbour(nodes, edges, "a", "down")).toBe("c")
    expect(neighbour(nodes, edges, "b", "left")).toBe("a")
  })

  test("without a wire that way they go to the closest step lying that way", () => {
    expect(neighbour(nodes, edges, "b", "right")).toBe("loose")
    // A step with no wires is reached by position, preferring the one most in line with it.
    expect(neighbour(nodes, edges, "loose", "left")).toBe("b")
    expect(neighbour(nodes, edges, "a", "left")).toBeUndefined()
    expect(neighbour(nodes, edges, "missing", "right")).toBeUndefined()
  })
})
