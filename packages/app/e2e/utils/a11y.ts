import { expect, type Page } from "@playwright/test"

// In-page structural audit for the elements under `scopes` (CSS selectors; portals are separate scopes):
// - every rendered interactive element (native control, widget role, or tab stop) has a non-empty name;
// - every ID named by aria-controls/-describedby/-labelledby/-owns/-activedescendant/-details/-errormessage
//   or label[for] resolves to exactly one element, and every ID inside the scopes is unique in the document;
// - no tab stop uses a positive tabindex or sits inside aria-hidden content while no dialog is open.
// - a widget named by aria-label(ledby) contains its own visible text (WCAG 2.5.3 label in name). Keyboard hints,
//   visually hidden text and symbol-only glyphs are not label text, and a widget that exposes its displayed
//   value through aria-describedby (the profile picker) keeps its purpose as the name.
// Kobalte's focus-scope sentinels ([data-focus-trap]) are visually hidden tab stops that only redirect focus;
// they are not controls and are excluded.
// Names follow a reduced accname (aria-labelledby, aria-label, <label>, content for roles named from content,
// then title/placeholder). It proves a name exists; it is not a full accname implementation.
export function auditAccessibility(page: Page, scopes: string[]) {
  return page.evaluate((scopes) => {
    const flat = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim()
    const describe = (element: Element) => {
      const hint =
        element.getAttribute("data-slot") ??
        element.getAttribute("data-component") ??
        element.getAttribute("class")?.split(/\s+/)[0]
      const role = element.getAttribute("role")
      return `<${element.tagName.toLowerCase()}${role ? ` role=${role}` : ""}${hint ? ` ${hint}` : ""}> "${flat(element.textContent).slice(0, 40)}"`
    }
    const roots = scopes.flatMap((scope) => [...document.querySelectorAll(scope)])
    if (roots.length === 0) return [`no element matches ${scopes.join(", ")}`]
    const elements = [...new Set(roots.flatMap((root) => [root, ...root.querySelectorAll("*")]))].filter(
      (element) => !element.hasAttribute("data-focus-trap"),
    )
    const widgets = new Set([
      "button",
      "link",
      "tab",
      "menuitem",
      "menuitemradio",
      "menuitemcheckbox",
      "checkbox",
      "radio",
      "switch",
      "option",
      "textbox",
      "searchbox",
      "combobox",
      "slider",
      "spinbutton",
      "treeitem",
    ])
    const fromContent = new Set([
      "button",
      "link",
      "tab",
      "menuitem",
      "menuitemradio",
      "menuitemcheckbox",
      "checkbox",
      "radio",
      "switch",
      "option",
      "treeitem",
      "focusable",
    ])
    const inputs: Record<string, string> = {
      checkbox: "checkbox",
      radio: "radio",
      range: "slider",
      number: "spinbutton",
      search: "searchbox",
      button: "button",
      submit: "button",
      reset: "button",
      image: "button",
    }
    const roleOf = (element: Element) => {
      const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0]
      if (explicit) return explicit
      const tag = element.tagName.toLowerCase()
      if (tag === "button" || tag === "summary") return "button"
      if (tag === "a" && element.hasAttribute("href")) return "link"
      if (tag === "select") return "combobox"
      if (tag === "textarea") return "textbox"
      if (element instanceof HTMLInputElement) return inputs[element.type] ?? "textbox"
      if (element instanceof HTMLElement && element.isContentEditable && element.hasAttribute("contenteditable"))
        return "textbox"
      if (element instanceof HTMLElement && element.hasAttribute("tabindex") && element.tabIndex >= 0)
        return "focusable"
      return undefined
    }
    const content = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
      if (!(node instanceof Element)) return ""
      if (node.getAttribute("aria-hidden") === "true") return ""
      const style = getComputedStyle(node)
      if (style.display === "none" || style.visibility === "hidden") return ""
      const label = flat(node.getAttribute("aria-label"))
      if (label) return ` ${label} `
      if (node instanceof HTMLImageElement) return ` ${node.alt} `
      if (node.tagName.toLowerCase() === "svg") return ` ${node.querySelector(":scope > title")?.textContent ?? ""} `
      const text = [...node.childNodes].map(content).join("")
      return style.display.startsWith("inline") ? text : ` ${text} `
    }
    const nameOf = (element: Element, role: string) => {
      const ids = flat(element.getAttribute("aria-labelledby")).split(" ").filter(Boolean)
      if (ids.length > 0)
        return flat(
          ids
            .map((id) => {
              const target = document.getElementById(id)
              return target ? flat(target.getAttribute("aria-label")) || flat(target.textContent) : ""
            })
            .join(" "),
        )
      const label = flat(element.getAttribute("aria-label"))
      if (label) return label
      const labels = "labels" in element ? (element.labels as NodeListOf<HTMLLabelElement> | null) : null
      if (labels && labels.length > 0) return flat([...labels].map((item) => item.textContent).join(" "))
      if (element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type))
        return flat(element.value)
      const text = fromContent.has(role) ? flat([...element.childNodes].map(content).join("")) : ""
      if (text) return text
      return (
        flat(element.getAttribute("title")) ||
        flat(element.getAttribute("placeholder")) ||
        flat(element.getAttribute("aria-placeholder"))
      )
    }
    const visible = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
      if (!(node instanceof Element) || node.tagName.toLowerCase() === "kbd") return ""
      if (node.getAttribute("aria-hidden") === "true" || !node.checkVisibility({ checkVisibilityCSS: true })) return ""
      const box = node.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) return ""
      return [...node.childNodes].map(visible).join(" ")
    }
    const mismatch = (element: Element, role: string) => {
      if (!element.hasAttribute("aria-label") && !element.hasAttribute("aria-labelledby")) return
      if (element.hasAttribute("aria-describedby")) return
      const text = flat([...element.childNodes].map(visible).join(" "))
      if (!/[\p{L}\p{N}]/u.test(text) || nameOf(element, role).toLowerCase().includes(text.toLowerCase())) return
      return text
    }
    const rendered = (element: Element) =>
      element.checkVisibility({ checkVisibilityCSS: true }) && !element.closest("[inert]")
    const dialogOpen = document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
    const references = [
      "aria-controls",
      "aria-describedby",
      "aria-labelledby",
      "aria-owns",
      "aria-activedescendant",
      "aria-details",
      "aria-errormessage",
      "for",
    ]
    const count = (id: string) => document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length
    return elements.flatMap((element) => {
      const role = roleOf(element)
      const interactive = role !== undefined && (widgets.has(role) || role === "focusable") && rendered(element)
      const stop = element instanceof HTMLElement && element.tabIndex >= 0 && rendered(element)
      return [
        ...(interactive && !nameOf(element, role) ? [`${describe(element)}: ${role} has no accessible name`] : []),
        ...(interactive && mismatch(element, role)
          ? [`${describe(element)}: name "${nameOf(element, role)}" omits visible "${mismatch(element, role)}"`]
          : []),
        ...(stop && element.tabIndex > 0 ? [`${describe(element)}: positive tabindex ${element.tabIndex}`] : []),
        ...(stop && !dialogOpen && element.closest('[aria-hidden="true"]')
          ? [`${describe(element)}: tab stop inside aria-hidden content`]
          : []),
        ...references.flatMap((attribute) =>
          flat(element.getAttribute(attribute))
            .split(" ")
            .filter(Boolean)
            .flatMap((id) => {
              const found = count(id)
              if (found === 1) return []
              return [`${describe(element)}: ${attribute}="${id}" resolves to ${found} elements`]
            }),
        ),
        ...(element.id && count(element.id) > 1 ? [`${describe(element)}: id "${element.id}" is not unique`] : []),
      ]
    })
  }, scopes)
}

// Marks the rendered tab stops under `scopes` in document order and returns their descriptions.
export function markTabStops(page: Page, scopes: string[]) {
  return page.evaluate((scopes) => {
    document.querySelectorAll("[data-a11y-stop]").forEach((element) => element.removeAttribute("data-a11y-stop"))
    const roots = scopes.flatMap((scope) => [...document.querySelectorAll(scope)])
    const stops = [...new Set(roots.flatMap((root) => [root, ...root.querySelectorAll("*")]))]
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement &&
          element.tabIndex >= 0 &&
          !element.hasAttribute("data-focus-trap") &&
          !element.matches(":disabled") &&
          element.checkVisibility({ checkVisibilityCSS: true }) &&
          !element.closest("[inert]"),
      )
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    stops.forEach((element, index) => element.setAttribute("data-a11y-stop", String(index)))
    return stops.map(
      (element) =>
        `${element.tagName.toLowerCase()}${element.getAttribute("role") ? `[${element.getAttribute("role")}]` : ""} ${(element.getAttribute("aria-label") ?? element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}`,
    )
  }, scopes)
}

function activeStop(page: Page, scopes: string[]) {
  return page.evaluate((scopes) => {
    const element = document.activeElement
    const marker = element?.getAttribute("data-a11y-stop")
    if (marker !== null && marker !== undefined) return Number(marker)
    const inside = scopes.some((scope) => [...document.querySelectorAll(scope)].some((root) => root.contains(element)))
    return `${inside ? "unmarked" : "outside"}: ${element?.tagName.toLowerCase()} ${(element?.getAttribute("aria-label") ?? element?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}`
  }, scopes)
}

// Walks the scope with Tab and Shift+Tab from its first and last stops. Every marked stop must be visited
// in document order both ways, and the step past either end must leave the scope (`trap: false`) or wrap
// to the opposite end (`trap: true`, modal dialogs only). Returns the stop descriptions.
export async function expectTabOrder(page: Page, scopes: string[], options: { trap: boolean }) {
  const stops = await markTabStops(page, scopes)
  expect(stops.length, `${scopes.join(", ")} has tab stops`).toBeGreaterThan(1)
  const label = (value: number | string) => (typeof value === "number" ? `${value}: ${stops[value]}` : value)
  const expected = stops.map((_, index) => label(index))
  const walk = async (start: number, key: string) => {
    await page.locator(`[data-a11y-stop="${start}"]`).focus()
    const visited = [label(await activeStop(page, scopes))]
    for (const _ of stops.slice(1)) {
      await page.keyboard.press(key)
      visited.push(label(await activeStop(page, scopes)))
    }
    await page.keyboard.press(key)
    return { visited, past: await activeStop(page, scopes) }
  }
  const forward = await walk(0, "Tab")
  expect(forward.visited, "Tab visits every stop in document order").toEqual(expected)
  if (options.trap) expect(label(forward.past), "Tab wraps inside the modal").toBe(label(0))
  if (!options.trap) expect(String(forward.past), "Tab leaves the scope after its last stop").toMatch(/^outside: /)
  const backward = await walk(stops.length - 1, "Shift+Tab")
  expect(backward.visited, "Shift+Tab visits every stop in reverse").toEqual(expected.toReversed())
  if (options.trap) expect(label(backward.past), "Shift+Tab wraps inside the modal").toBe(label(stops.length - 1))
  if (!options.trap)
    expect(String(backward.past), "Shift+Tab leaves the scope before its first stop").toMatch(/^outside: /)
  return stops
}

export type ContrastTarget = { name: string; selector: string; kind?: "text" | "ring" | "graphic" }
export type ContrastResult = { name: string; ratio: number; required: number; fg: string; bg: string; samples: number }

// WCAG 2.x contrast computed in the page from computed colors, at a grid of points over each text box
// (icon box for graphics, element box for focus rings). At every point the background is rebuilt by
// alpha-compositing, from the root down to the element: each ancestor's background-color, its gradient layers
// evaluated at that point (linear by angle, explicit-size radial; any other gradient falls back to all of its
// stops, the worst of which wins), covering ::before/::after overlays, and backdrop-filter brightness() and
// saturate() applied to everything beneath. A background photograph (cover, centered) is drawn into a canvas,
// blurred by the backdrop-filter blur() of the glass above it, and read at the point. Ancestor opacity is a
// group lerp. The ink (text color, icon stroke or outline color) is composited over that background and the
// minimum ratio over all points is reported. Portals are measured over their DOM ancestors, not over a sibling
// scrim; dialogs and menus are >= 97% opaque, so that error is below the reported precision. Text >= 24px, or
// >= 18.66px at weight >= 700, needs 3:1 and other text 4.5:1; icons and focus rings need 3:1 (WCAG 1.4.11),
// a ring against the colors on both sides of it.
export function measureContrast(page: Page, targets: ContrastTarget[]) {
  return page.evaluate(async (targets) => {
    type Color = { r: number; g: number; b: number; a: number }
    type Point = { x: number; y: number }
    type Layer = (point: Point) => Color[]
    const describe = (element: Element) =>
      `<${element.tagName.toLowerCase()} ${element.getAttribute("data-slot") ?? element.getAttribute("class")?.split(/\s+/)[0] ?? ""}>`
    const probe = document.createElement("canvas")
    probe.width = 1
    probe.height = 1
    const context = probe.getContext("2d", { willReadFrequently: true })!
    const parse = (value: string): Color => {
      const match = value
        .trim()
        .match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/)
      if (match)
        return {
          r: Number(match[1]),
          g: Number(match[2]),
          b: Number(match[3]),
          a: match[4] === undefined ? 1 : Number(match[4]) / (match[5] ? 100 : 1),
        }
      if (value.trim() === "transparent") return { r: 0, g: 0, b: 0, a: 0 }
      if (!CSS.supports("color", value)) throw new Error(`Unparsed color ${value}`)
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const data = context.getImageData(0, 0, 1, 1).data
      return { r: data[0], g: data[1], b: data[2], a: data[3] / 255 }
    }
    const over = (top: Color, bottom: Color): Color => {
      const a = top.a + bottom.a * (1 - top.a)
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
      const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a
      return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a }
    }
    const lerp = (from: Color, to: Color, amount: number): Color => ({
      r: from.r + (to.r - from.r) * amount,
      g: from.g + (to.g - from.g) * amount,
      b: from.b + (to.b - from.b) * amount,
      a: from.a + (to.a - from.a) * amount,
    })
    const channel = (value: number) => {
      const s = Math.min(255, Math.max(0, value)) / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const luminance = (color: Color) =>
      0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
    const ratio = (a: Color, b: Color) => {
      const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (values[0] + 0.05) / (values[1] + 0.05)
    }
    const hex = (color: Color) =>
      `#${[color.r, color.g, color.b]
        .map((value) =>
          Math.round(Math.min(255, Math.max(0, value)))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`
    const split = (value: string) =>
      [...value]
        .reduce(
          (state, char) => {
            if (char === "," && state.depth === 0) return { depth: 0, parts: [...state.parts, ""] }
            const depth = state.depth + (char === "(" ? 1 : char === ")" ? -1 : 0)
            return { depth, parts: [...state.parts.slice(0, -1), state.parts.at(-1) + char] }
          },
          { depth: 0, parts: [""] },
        )
        .parts.map((part) => part.trim())
    const colorPattern =
      /rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)|hsla?\([^)]*\)|color\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\btransparent\b/g
    const sides: Record<string, number> = { "to top": 0, "to right": 90, "to bottom": 180, "to left": 270 }
    // Returns the gradient's color at a point of `box`, or undefined for a form this evaluator does not model.
    const evaluate = (image: string, box: DOMRect) => {
      const match = image.match(/^(linear|radial)-gradient\((.*)\)$/s)
      if (!match) return
      const args = split(match[2])
      const leading = !new RegExp(`^(${colorPattern.source})`).test(args[0])
      const head = leading ? args[0] : undefined
      const stops = (leading ? args.slice(1) : args).map((stop) => {
        const color = stop.match(new RegExp(`^(${colorPattern.source})\\s*(.*)$`))
        if (!color) return
        const position = color.at(-1)!.trim()
        if (position && !/^-?[\d.]+%$/.test(position)) return
        return { color: parse(color[1]), position: position ? parseFloat(position) / 100 : undefined }
      })
      if (stops.length < 2 || stops.some((stop) => stop === undefined)) return
      const known = stops as { color: Color; position: number | undefined }[]
      const placed = known.map((stop, index) => {
        if (stop.position !== undefined) return { color: stop.color, position: stop.position }
        if (index === 0) return { color: stop.color, position: 0 }
        if (index === known.length - 1) return { color: stop.color, position: 1 }
        const before = known.slice(0, index).findLastIndex((item) => item.position !== undefined)
        const after = known.findIndex((item, at) => at > index && item.position !== undefined)
        const start = before < 0 ? 0 : known[before].position!
        const end = after < 0 ? 1 : known[after].position!
        const from = before < 0 ? 0 : before
        const to = after < 0 ? known.length - 1 : after
        return { color: stop.color, position: start + ((end - start) * (index - from)) / (to - from) }
      })
      const at = (t: number) => {
        const next = placed.findIndex((stop) => stop.position >= t)
        if (next <= 0) return placed[Math.max(0, next)].color
        const a = placed[next - 1]
        const b = placed[next]
        const f = b.position === a.position ? 1 : (t - a.position) / (b.position - a.position)
        // Gradients of legacy sRGB colors interpolate premultiplied in sRGB.
        const alpha = a.color.a + (b.color.a - a.color.a) * f
        if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }
        const mix = (x: number, y: number) => (x * a.color.a + (y * b.color.a - x * a.color.a) * f) / alpha
        return { r: mix(a.color.r, b.color.r), g: mix(a.color.g, b.color.g), b: mix(a.color.b, b.color.b), a: alpha }
      }
      if (match[1] === "linear") {
        const angle = head === undefined ? 180 : head.endsWith("deg") ? parseFloat(head) : sides[head]
        if (angle === undefined || Number.isNaN(angle)) return
        const radians = (angle * Math.PI) / 180
        const length = Math.abs(box.width * Math.sin(radians)) + Math.abs(box.height * Math.cos(radians))
        return (point: Point) =>
          at(
            ((point.x - box.left - box.width / 2) * Math.sin(radians) -
              (point.y - box.top - box.height / 2) * Math.cos(radians)) /
              length +
              0.5,
          )
      }
      const shape = head?.match(/^([\d.]+)px ([\d.]+)px at ([\d.]+)% ([\d.]+)%$/)
      if (!shape) return
      return (point: Point) =>
        at(
          Math.hypot(
            (point.x - box.left - (box.width * Number(shape[3])) / 100) / Number(shape[1]),
            (point.y - box.top - (box.height * Number(shape[4])) / 100) / Number(shape[2]),
          ),
        )
    }
    const images = new Map<string, HTMLImageElement>()
    const photo = async (owner: Element, style: CSSStyleDeclaration, image: string, blur: number) => {
      if (style.backgroundSize !== "cover" || style.backgroundPosition !== "50% 50%")
        throw new Error(
          `Unsupported background ${style.backgroundSize} ${style.backgroundPosition} on ${describe(owner)}`,
        )
      const url = image.slice(4, -1).replace(/^["']|["']$/g, "")
      const source = images.get(url) ?? new Image()
      if (!images.has(url)) {
        source.src = url
        await source.decode()
        images.set(url, source)
      }
      const box = owner.getBoundingClientRect()
      const scale = Math.max(box.width / source.naturalWidth, box.height / source.naturalHeight)
      const surface = document.createElement("canvas")
      surface.width = Math.ceil(box.width)
      surface.height = Math.ceil(box.height)
      const draw = surface.getContext("2d", { willReadFrequently: true })!
      // Unpremultiplied reads renormalize the transparent margin the blur pulls in at the canvas edge.
      draw.filter = blur > 0 ? `blur(${blur}px)` : "none"
      draw.drawImage(
        source,
        (box.width - source.naturalWidth * scale) / 2,
        (box.height - source.naturalHeight * scale) / 2,
        source.naturalWidth * scale,
        source.naturalHeight * scale,
      )
      const data = draw.getImageData(0, 0, surface.width, surface.height).data
      return (point: Point) => {
        const x = Math.min(surface.width - 1, Math.max(0, Math.floor(point.x - box.left)))
        const y = Math.min(surface.height - 1, Math.max(0, Math.floor(point.y - box.top)))
        const offset = (y * surface.width + x) * 4
        return [{ r: data[offset], g: data[offset + 1], b: data[offset + 2], a: 1 }]
      }
    }
    const filters = (value: string) =>
      value === "none"
        ? []
        : (value.match(/[a-z-]+\([^)]*\)/g) ?? []).map((item) => {
            const name = item.slice(0, item.indexOf("("))
            const amount = parseFloat(item.slice(item.indexOf("(") + 1))
            if (!["blur", "brightness", "saturate"].includes(name))
              throw new Error(`Unsupported backdrop filter ${item}`)
            return { name, amount }
          })
    const filter = (color: Color, list: { name: string; amount: number }[]) =>
      list.reduce((current, item) => {
        if (item.name === "brightness")
          return { r: current.r * item.amount, g: current.g * item.amount, b: current.b * item.amount, a: current.a }
        if (item.name !== "saturate") return current
        const s = item.amount
        return {
          r: (0.213 + 0.787 * s) * current.r + (0.715 - 0.715 * s) * current.g + (0.072 - 0.072 * s) * current.b,
          g: (0.213 - 0.213 * s) * current.r + (0.715 + 0.285 * s) * current.g + (0.072 - 0.072 * s) * current.b,
          b: (0.213 - 0.213 * s) * current.r + (0.715 - 0.715 * s) * current.g + (0.072 + 0.928 * s) * current.b,
          a: current.a,
        }
      }, color)
    const covering = (layer: CSSStyleDeclaration) =>
      layer.content !== "none" &&
      ["absolute", "fixed"].includes(layer.position) &&
      [layer.top, layer.right, layer.bottom, layer.left].every((value) => value === "0px")
    // Each painted layer of one element, bottom first, as a function from a point to its candidate colors.
    const layers = async (element: Element, blur: number) => {
      const box = element.getBoundingClientRect()
      const own = (layer: CSSStyleDeclaration) =>
        Promise.all([
          Promise.resolve<Layer>(() => [parse(layer.backgroundColor)]),
          ...split(layer.backgroundImage)
            .filter((image) => image !== "none")
            .toReversed()
            .map(async (image): Promise<Layer> => {
              if (image.startsWith("url(")) return photo(element, layer, image, blur)
              const gradient = evaluate(image, box)
              if (gradient) return (point) => [gradient(point)]
              const stops = (image.match(colorPattern) ?? []).map(parse)
              return () => stops
            }),
        ])
      const style = getComputedStyle(element)
      const pseudo = await Promise.all(
        ["::before", "::after"].map((name) => {
          const layer = getComputedStyle(element, name)
          return covering(layer) ? own(layer) : Promise.resolve([])
        }),
      )
      return {
        layers: [...(await own(style)), ...pseudo.flat()],
        opacity: Number(style.opacity),
        backdrop: filters(style.backdropFilter),
      }
    }
    const ancestry = (element: Element): Element[] =>
      element.parentElement ? [...ancestry(element.parentElement), element] : [element]
    const paint = async (element: Element, points: Point[], ink: Color) => {
      const chain = ancestry(element)
      const blurs = chain.map(
        (node) => filters(getComputedStyle(node).backdropFilter).find((item) => item.name === "blur")?.amount ?? 0,
      )
      // A photograph is seen through the first glass above it.
      const steps = await Promise.all(
        chain.map((node, index) => layers(node, blurs.slice(index + 1).find((value) => value > 0) ?? 0)),
      )
      // Every [ink, background] pair reachable at `point` when painting chain[index..] over `below`.
      const visit = (index: number, below: Color, point: Point): [Color, Color][] => {
        const step = steps[index]
        const backgrounds = step.layers.reduce(
          (current, layer) =>
            current.flatMap((background) => layer(point).map((candidate) => over(candidate, background))),
          [filter(below, step.backdrop)],
        )
        const pairs = backgrounds.flatMap((background): [Color, Color][] =>
          index === chain.length - 1 ? [[over(ink, background), background]] : visit(index + 1, background, point),
        )
        if (step.opacity >= 1) return pairs
        return pairs.map((pair): [Color, Color] => [
          lerp(below, pair[0], step.opacity),
          lerp(below, pair[1], step.opacity),
        ])
      }
      return points.flatMap((point) => visit(0, { r: 255, g: 255, b: 255, a: 1 }, point))
    }
    const grid = (box: DOMRect, columns: number, rows: number) =>
      Array.from({ length: columns * rows }, (_, index) => ({
        x: box.left + (((index % columns) + 0.5) * box.width) / columns,
        y: box.top + ((Math.floor(index / columns) + 0.5) * box.height) / rows,
      }))
    const worst = (pairs: [Color, Color][]) =>
      pairs.reduce(
        (current, pair) => {
          const value = ratio(pair[0], pair[1])
          return value < current.ratio ? { ratio: value, fg: pair[0], bg: pair[1] } : current
        },
        { ratio: Infinity, fg: pairs[0][0], bg: pairs[0][1] },
      )
    const textRect = (element: Element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getBoundingClientRect()
    }
    const enabled = (element: Element) =>
      element.checkVisibility({ checkVisibilityCSS: true }) &&
      !element.closest(':disabled, [aria-disabled="true"], [data-disabled]')
    const measureText = async (target: { name: string; selector: string }) => {
      const owners = [...document.querySelectorAll(target.selector)]
        .flatMap((root) => [root, ...root.querySelectorAll("*")])
        .filter(
          (element) =>
            [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) &&
            enabled(element) &&
            textRect(element).width > 2 &&
            textRect(element).height > 2,
        )
      if (owners.length === 0) throw new Error(`No visible text under ${target.name} (${target.selector})`)
      const results = await Promise.all(
        owners.map(async (owner) => {
          const style = getComputedStyle(owner)
          const size = parseFloat(style.fontSize)
          const required = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5
          return { required, ...worst(await paint(owner, grid(textRect(owner), 12, 3), parse(style.color))) }
        }),
      )
      const result = results.reduce((current, item) =>
        item.ratio / item.required < current.ratio / current.required ? item : current,
      )
      return { samples: owners.length, ...result }
    }
    const measureGraphic = async (target: { name: string; selector: string }) => {
      const graphics = [...document.querySelectorAll(target.selector)].filter(enabled)
      if (graphics.length === 0) throw new Error(`No visible graphic under ${target.name} (${target.selector})`)
      const results = await Promise.all(
        graphics.map(async (graphic) => {
          const style = getComputedStyle(graphic)
          const ink = parse(style.stroke !== "none" ? style.stroke : style.fill)
          return worst(await paint(graphic, grid(graphic.getBoundingClientRect(), 4, 4), ink))
        }),
      )
      return {
        samples: graphics.length,
        required: 3,
        ...results.reduce((current, item) => (item.ratio < current.ratio ? item : current)),
      }
    }
    const measureRing = async (target: { name: string; selector: string }) => {
      const element = document.querySelector(target.selector)
      if (!element?.matches(":focus-visible")) throw new Error(`${target.name} is not keyboard-focused`)
      const style = getComputedStyle(element)
      const width = parseFloat(style.outlineWidth)
      if (style.outlineStyle === "none" || !(width > 0)) throw new Error(`${target.name} has no focus outline`)
      const offset = parseFloat(style.outlineOffset)
      const ring = parse(style.outlineColor)
      const points = grid(element.getBoundingClientRect(), 6, 2)
      // The ring spans [offset, offset + width] outward from the border edge; it borders the element's
      // own background inside and the parent's outside.
      const inner = offset < 0 ? await paint(element, points, ring) : []
      const outer = offset + width > 0 && element.parentElement ? await paint(element.parentElement, points, ring) : []
      return { samples: 1, required: 3, ...worst([...inner, ...outer]) }
    }
    const results = []
    for (const target of targets) {
      const result = await (target.kind === "ring"
        ? measureRing(target)
        : target.kind === "graphic"
          ? measureGraphic(target)
          : measureText(target))
      results.push({
        name: target.name,
        ratio: Math.floor(result.ratio * 100) / 100,
        required: result.required,
        fg: hex(result.fg),
        bg: hex(result.bg),
        samples: result.samples,
      })
    }
    return results
  }, targets)
}

// Every CSS transition, CSS animation, and running Web Animation under `scopes`, including ::before/::after.
export function motionInventory(page: Page, scopes: string[]) {
  return page.evaluate((scopes) => {
    const seconds = (value: string) =>
      Math.max(...value.split(",").map((item) => parseFloat(item) * (item.trim().endsWith("ms") ? 0.001 : 1)))
    const roots = scopes.flatMap((scope) => [...document.querySelectorAll(scope)])
    const elements = [...new Set(roots.flatMap((root) => [root, ...root.querySelectorAll("*")]))]
    const describe = (element: Element, pseudo: string) =>
      `<${element.tagName.toLowerCase()} ${element.getAttribute("data-slot") ?? element.getAttribute("data-component") ?? element.getAttribute("class")?.split(/\s+/)[0] ?? ""}>${pseudo}`
    const styled = elements.flatMap((element) =>
      ["", "::before", "::after"].flatMap((pseudo) => {
        const style = getComputedStyle(element, pseudo || null)
        if (pseudo && style.content === "none") return []
        const transition = style.transitionProperty === "none" ? 0 : seconds(style.transitionDuration)
        const animation = style.animationName === "none" ? 0 : seconds(style.animationDuration)
        if (transition === 0 && animation === 0) return []
        return [{ element: describe(element, pseudo), transition: transition * 1000, animation: animation * 1000 }]
      }),
    )
    const scripted = document
      .getAnimations()
      .filter((animation) => {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null
        return (
          !(animation instanceof CSSAnimation) &&
          !(animation instanceof CSSTransition) &&
          animation.playState === "running" &&
          target !== null &&
          roots.some((root) => root.contains(target))
        )
      })
      .map((animation) => ({
        element: `script ${describe((animation.effect as KeyframeEffect).target!, "")}`,
        transition: 0,
        animation: Number(animation.effect?.getComputedTiming().duration ?? 0),
      }))
    return [...styled, ...scripted]
  }, scopes)
}
