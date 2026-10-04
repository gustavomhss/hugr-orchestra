const registryKey = "__opencodeDockRefs"

const registryExpr = (namespaceExpression = `window[${JSON.stringify(registryKey)}]?.namespace ?? 0`) => `(() => {
  const key = ${JSON.stringify(registryKey)}
  const namespace = ${namespaceExpression}
  if (window[key]) return window[key]
  const refs = new WeakMap()
  const byRef = new Map()
  const registry = {
     refs,
     byRef,
     namespace,
     next: namespace * 4096 + 1,
    refFor(el) {
      const ref = refs.get(el)
      if (ref !== undefined) return ref
       const assigned = registry.next++
      refs.set(el, assigned)
      byRef.set(assigned, el)
      if (byRef.size > 4096) {
        const oldest = byRef.keys().next().value
        byRef.delete(oldest)
      }
      return assigned
    },
    resolve(ref) {
      const el = byRef.get(ref)
      if (!el || !el.isConnected) return null
      return el
    },
  }
   Object.defineProperty(window, key, { value: registry, configurable: true, enumerable: false })
  return registry
})()`

export type SnapshotMode = "full" | "a11y" | "skeleton"
export type SnapshotFormat = "json" | "tree" | "csv"

type SnapshotOptions = {
  budget?: number
  maxText?: number
  namespace?: number
  mode?: SnapshotMode
  format?: SnapshotFormat
  actionable?: boolean
  visible?: boolean
}

export function buildSnapshotScript(options: SnapshotOptions = {}) {
  const budget = Math.max(1, Math.min(Math.round(options.budget ?? 100) || 100, 500))
  const maxText = Math.max(0, Math.min(Math.round(options.maxText ?? 1500), 20000))
  const namespace = Number.isSafeInteger(options.namespace) && (options.namespace ?? 0) > 0 ? options.namespace : 1
  const mode: SnapshotMode = options.mode ?? "full"
  const format: SnapshotFormat = options.format ?? "json"
  const actionable = options.actionable === true
  const visibleOnly = options.visible === true
  const geometry = mode === "full"
  const scanCap = Math.min(4000, budget * 6 + 60)
  return `(() => {
  window.__opencodeDockRefNamespace = ${namespace}
  if (window[${JSON.stringify(registryKey)}] && window[${JSON.stringify(registryKey)}].namespace !== ${namespace}) delete window[${JSON.stringify(registryKey)}]
  const registry = ${registryExpr(String(namespace))}
  const budget = ${budget}
  const maxText = ${maxText}
  const mode = ${JSON.stringify(mode)}
  const format = ${JSON.stringify(format)}
  const geometry = ${geometry}
  const actionableOnly = ${actionable}
  const visibleOnly = ${visibleOnly}
  const scanCap = ${scanCap}
  const state = { url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight }, mode, format, items: [], text: "", truncated: false, itemCount: 0 }
  const containers = { dialog: 1, navigation: 1, main: 1, banner: 1, contentinfo: 1, complementary: 1, form: 1, list: 1, listitem: 1, listbox: 1, group: 1, tablist: 1, tab: 1, tabpanel: 1, tree: 1, treeitem: 1, grid: 1, row: 1, cell: 1, rowgroup: 1, columnheader: 1, toolbar: 1, menu: 1, menuitem: 1, region: 1, article: 1, table: 1, search: 1, application: 1, document: 1 }
  const structuralTag = { NAV: "navigation", MAIN: "main", HEADER: "banner", FOOTER: "contentinfo", ASIDE: "complementary", FORM: "form", UL: "list", OL: "list", LI: "listitem", SELECT: "listbox", FIELDSET: "group", DIALOG: "dialog", DETAILS: "group", TABLE: "table", THEAD: "rowgroup", TBODY: "rowgroup", TR: "row", TD: "cell", TH: "columnheader", SECTION: "region", ARTICLE: "article", SEARCH: "search" }
  const roleOf = (el) => {
    const explicit = el.getAttribute && el.getAttribute("role")
    if (explicit) return explicit.split(/\\s+/)[0]
    const tag = el.tagName
    if (structuralTag[tag]) return structuralTag[tag]
    if (tag === "A") return el.hasAttribute("href") ? "link" : "text"
    if (tag === "BUTTON" || tag === "SUMMARY") return "button"
    if (tag === "TEXTAREA") return "textbox"
    if (tag === "OPTION") return "option"
    if (tag === "INPUT") {
      switch ((el.type || "text").toLowerCase()) {
        case "checkbox": return "checkbox"
        case "radio": return "radio"
        case "range": return "slider"
        case "color": return "button"
        case "file": return "button"
        case "submit": case "reset": case "button": return "button"
        default: return "textbox"
      }
    }
    if (el.isContentEditable) return "textbox"
    if (el.hasAttribute && (el.hasAttribute("onclick") || el.hasAttribute("tabindex") || el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby"))) return "button"
    return null
  }
  const take = (value) => {
    if (!value) return ""
    const s = String(value).replace(/\\s+/g, " ").trim()
    return s.slice(0, 160)
  }
  const nameOf = (el) => {
    if (el.labels && el.labels.length) {
      const fromLabel = take(el.labels[0].innerText)
      if (fromLabel) return fromLabel
    }
    if (el.getAttribute) {
      const labelled = el.getAttribute("aria-labelledby")
      if (labelled) {
        const owner = document.getElementById(labelled.split(/\\s+/)[0])
        if (owner) { const fromOwner = take(owner.innerText); if (fromOwner) return fromOwner }
      }
      const direct = ["aria-label", "alt", "title", "value", "placeholder"].map((key) => take(el.getAttribute(key))).find(Boolean)
      if (direct) return direct
    }
    if (el.innerText) { const fromText = take(el.innerText); if (fromText) return fromText }
    if (el.textContent) { const fromContent = take(el.textContent); if (fromContent) return fromContent }
    return el.tagName ? el.tagName.toLowerCase() : "unknown"
  }
  const visible = (el) => {
    if (!el.getClientRects || el.getClientRects().length === 0) return false
    const style = getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) return false
    return true
  }
  const inert = (el) => {
    let node = el
    while (node && node !== document) {
      if (typeof ShadowRoot !== "undefined" && node instanceof ShadowRoot) { node = node.host; continue }
      if (node.getAttribute && (node.getAttribute("aria-hidden") === "true" || node.getAttribute("hidden") !== null)) return true
      if (node.tagName === "FIELDSET" && node.disabled) return true
      node = node.parentNode
    }
    return false
  }
  const stateOf = (el) => {
    const out = {}
    if (el.disabled !== undefined) out.disabled = el.disabled
    if (el.checked !== undefined) out.checked = el.checked
    if (el.selected !== undefined) out.selected = el.selected
    if (el.getAttribute && el.getAttribute("aria-expanded")) out.expanded = el.getAttribute("aria-expanded") === "true"
    if (el.getAttribute && el.getAttribute("aria-selected")) out.selected = el.getAttribute("aria-selected") === "true"
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") out.value = (el.value || "").slice(0, 200)
    if (el.tagName === "SELECT") out.value = (el.options[el.selectedIndex]?.text || "").slice(0, 160)
    return out
  }
  const selector = "a[href], button, input, textarea, select, option, summary, [contenteditable], [role], [onclick], [tabindex], [aria-label], [aria-labelledby]"
  const matched = []
  const maxShadowDepth = 32
  let traversalTruncated = false
  const collect = (root, depth = 0) => {
    for (const el of root.querySelectorAll(selector)) {
      matched.push(el)
      if (matched.length > scanCap) return true
    }
    for (const host of root.querySelectorAll("*")) {
      if (!host.shadowRoot) continue
      if (depth >= maxShadowDepth) {
        traversalTruncated = true
        continue
      }
      if (collect(host.shadowRoot, depth + 1)) return true
    }
    return false
  }
  collect(document)
  const interactive = new Set(matched)
  // Structure must survive filtering: collect the semantic ancestors that give
  // every actionable control a resolvable parent instead of a flat guess.
  const parentOf = new Map()
  const order = []
  const seen = new Set()
  const containerTag = { DIV: 1, SECTION: 1, FORM: 1, FIELDSET: 1, DETAILS: 1, NAV: 1, MAIN: 1, HEADER: 1, FOOTER: 1, ASIDE: 1, UL: 1, OL: 1, LI: 1, TABLE: 1, TR: 1, DIALOG: 1 }
  const chain = (el) => {
    const out = []
    let generic = 0
    let node = el
    while (node && node !== document) {
      if (typeof ShadowRoot !== "undefined" && node instanceof ShadowRoot) { node = node.host; continue }
      if (node.nodeType === 1) {
        const role = roleOf(node)
        if (role) {
          out.push({ el: node, role })
          generic = 0
        } else if (containerTag[node.tagName] && generic < 2) {
          // DOM ancestry is real structure; a wrapper without ARIA is reported as
          // a group rather than dropping its descendants into a flat list.
          out.push({ el: node, role: "group", inferred: true })
          generic++
        }
      }
      node = node.parentNode
    }
    return out.reverse()
  }
  const all = new Set()
  for (const el of matched) for (const entry of chain(el)) all.add(entry.el)
  const sorted = [...all].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : a === b ? 0 : 1))
  const states = new Map()
  for (const el of sorted) {
    const ancestors = chain(el)
    // chain() is root-first and ends with the node itself, so the nearest
    // strict ancestor is the entry before it.
    const parent = ancestors.length > 1 ? ancestors[ancestors.length - 2] : undefined
    const own = ancestors[ancestors.length - 1]
    parentOf.set(el, parent ? parent.el : null)
    const role = own?.role ?? roleOf(el)
    // An inferred wrapper has no accessible name; its whole subtree text would
    // make every path segment unreadable.
    const name = own?.inferred ? take(el.getAttribute?.("aria-label") || el.innerText || "").slice(0, 40) : nameOf(el)
    states.set(el, { role: role ?? "generic", name, actionable: interactive.has(el) && !el.disabled && !inert(el), shown: visible(el) && !inert(el) })
    order.push(el)
  }
  const wanted = new Set()
  for (const el of sorted) {
    const info = states.get(el)
    if ((!actionableOnly || info.actionable) && (!visibleOnly || info.shown)) wanted.add(el)
  }
  // Retain ancestors of retained nodes so parentRef/children stay closed.
  for (const el of [...wanted]) for (const entry of chain(el)) wanted.add(entry.el)
  const kept = sorted.filter((el) => wanted.has(el))
  let current = kept.slice(0, budget)
  state.truncated = traversalTruncated || matched.length > scanCap || kept.length > current.length
  const pathOf = new Map()
  const buildItems = (nodes) => {
    const byElement = new Map(nodes.map((el) => [el, null]))
    for (const el of nodes) {
      const segments = []
      const counts = new Map()
      for (const entry of chain(el)) {
        const node = entry.el
        if (!byElement.has(node)) continue
        const nodeInfo = states.get(node)
        const key = nodeInfo.name ? nodeInfo.role + "[" + nodeInfo.name + "]" : nodeInfo.role
        const seenCount = (counts.get(key) ?? 0) + 1
        counts.set(key, seenCount)
        segments.push(seenCount > 1 ? key + "#" + seenCount : key)
      }
      pathOf.set(el, "/" + segments.join("/"))
    }
    const items = nodes.map((el, position) => {
      const target = el.closest && el.closest("a[href]") ? el.closest("a[href]") : el
      const info = states.get(el)
      const item = {
        ref: registry.refFor(el),
        role: info.role,
        name: info.name,
        tag: target.tagName.toLowerCase(),
        href: target.href || undefined,
        path: pathOf.get(el),
        parentRef: null,
        children: [],
        actionable: info.actionable,
        visible: info.shown,
        order: position,
        ...stateOf(el),
      }
      if (geometry) {
        const rect = target.getBoundingClientRect()
        const round = (n) => Math.round(n * 10) / 10
        item.x = round(rect.left)
        item.y = round(rect.top)
        item.width = round(rect.width)
        item.height = round(rect.height)
      }
      byElement.set(el, item)
      return item
    })
    for (const item of items) {
      const parent = parentOf.get(nodes[item.order])
      const parentItem = parent ? byElement.get(parent) : null
      if (!parentItem || parentItem === item) continue
      item.parentRef = parentItem.ref
      parentItem.children.push(item.ref)
    }
    return { items, byElement }
  }
  // A budget cut can keep a container whose children were cut. Prune orphans and
  // childless non-actionable wrappers so parentRef/children always stay closed.
  for (let pass = 0; pass < 4; pass++) {
    const built = buildItems(current)
    const refs = new Map(built.items.map((item) => [item.ref, item]))
    const drop = new Set()
    for (const item of built.items) {
      if (item.parentRef !== null && !refs.has(item.parentRef)) drop.add(item.ref)
      else if (!item.actionable && item.children.length === 0) drop.add(item.ref)
    }
    state.items = built.items
    if (!drop.size) break
    current = current.filter((el) => !drop.has(registry.refFor(el)))
  }
  state.itemCount = state.items.length
  if (format === "tree") {
    const lines = ['application "' + location.hostname + '"']
    const label = (item) => {
      const flags = []
      if (item.disabled) flags.push("disabled")
      if (item.checked) flags.push("checked")
      if (item.selected) flags.push("selected")
      if (item.expanded !== undefined) flags.push(item.expanded ? "expanded" : "collapsed")
      return item.role + ' "' + item.name + '"' + (flags.length ? " (" + flags.join(", ") + ")" : "")
    }
    const walk = (item, depth) => {
      lines.push("  ".repeat(depth + 1) + label(item))
      for (const child of item.children) {
        const found = state.items.find((candidate) => candidate.ref === child)
        if (found) walk(found, depth + 1)
      }
    }
    for (const item of state.items) if (item.parentRef === null) walk(item, 0)
    state.treeText = lines.join("\\n")
  }
  if (format === "csv") {
    const cell = (value) => {
      if (value === undefined || value === null) return ""
      const text = String(value)
      return /[",\\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text
    }
    const columns = ["path", "role", "name", "tag", "ref", "parentRef", "actionable", "visible", "disabled", "checked", "selected", "expanded", "value", "href"]
    const rows = [columns.join(",")]
    for (const item of state.items) rows.push(columns.map((column) => cell(item[column])).join(","))
    state.csv = rows.join("\\n")
  }
  if (maxText > 0 && document.body && document.body.innerText) {
    state.text = document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, maxText)
  }
  return state
})()`
}

export function buildClickScript(ref: number, expectedNamespace?: number) {
  return `(() => {
  const registry = ${registryExpr(expectedNamespace === undefined ? undefined : String(expectedNamespace))}
  if (${expectedNamespace === undefined ? "false" : `registry.namespace !== ${expectedNamespace}`}) return { ok: false, error: "Element ref ${ref} became stale; re-read the page" }
  const el = registry.resolve(${ref})
  if (!el) return { ok: false, error: "Element ref ${ref} is gone; re-read the page" }
  if (!el.isConnected) return { ok: false, error: "Element ref ${ref} is disconnected from DOM" }
  const link = el.closest && el.closest("a[href]")
  const clickTarget = link || el
  const hidden = (node) => { for (let depth = 0; node && depth < 64; depth++) { const style = getComputedStyle(node); if (node.getAttribute?.("aria-hidden") === "true" || node.getAttribute?.("aria-disabled") === "true" || node.hasAttribute?.("hidden") || node.hasAttribute?.("inert") || node.inert === true || (node.tagName === "FIELDSET" && node.disabled === true) || style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0 || style.pointerEvents === "none") return true; const root = node.getRootNode?.(); node = node.parentElement || (root instanceof ShadowRoot ? root.host : null) } return false }
  if (hidden(clickTarget)) return { ok: false, error: "Element ref ${ref} is inert" }
  if (clickTarget.disabled === true) return { ok: false, error: "Element ref ${ref} is disabled" }

  // Check if element is visible and clickable
  const style = getComputedStyle(clickTarget)
  if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0)
    return { ok: false, error: "Element ref ${ref} is not visible" }

  clickTarget.scrollIntoView({ block: "center", inline: "center" })

  const rect = clickTarget.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0)
    return { ok: false, error: "Element ref ${ref} has zero size" }

  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  clickTarget.focus()
  clickTarget.click()

  return { ok: true, tag: clickTarget.tagName.toLowerCase(), ref: ${ref}, x, y, url: location.href, href: clickTarget.href || "" }
})()`
}

export function buildElementPointScript(ref: number, expectedNamespace?: number) {
  return `(async () => {
  const registry = ${registryExpr()}
  if (${expectedNamespace === undefined ? "false" : `registry.namespace !== ${expectedNamespace}`}) return { ok: false, error: "Element ref ${ref} became stale; re-read the page" }
  const el = registry.resolve(${ref})
  if (!el) return { ok: false, error: "Element ref ${ref} is gone; re-read the page" }
  if (!el.isConnected) return { ok: false, error: "Element ref ${ref} is disconnected from DOM" }
  el.scrollIntoView({ block: "center", inline: "center" })
  await new Promise(r => setTimeout(r, 50))
  const link = el.closest && el.closest("a[href]")
  const target = link || el
  const hidden = (node) => { for (let depth = 0; node && depth < 64; depth++) { const style = getComputedStyle(node); if (node.getAttribute?.("aria-hidden") === "true" || node.getAttribute?.("aria-disabled") === "true" || node.hasAttribute?.("hidden") || node.hasAttribute?.("inert") || node.inert === true || (node.tagName === "FIELDSET" && node.disabled === true) || style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0 || style.pointerEvents === "none") return true; const root = node.getRootNode?.(); node = node.parentElement || (root instanceof ShadowRoot ? root.host : null) } return false }
  if (hidden(target)) return { ok: false, error: "Element ref ${ref} is inert" }
  if (target.disabled === true) return { ok: false, error: "Element ref ${ref} is disabled" }
  const targetStyle = getComputedStyle(target)
  if (targetStyle.display === "none" || targetStyle.visibility === "hidden" || parseFloat(targetStyle.opacity) === 0)
    return { ok: false, error: "Element ref ${ref} is not visible" }
  const targetRect = target.getBoundingClientRect()
  if (targetRect.width <= 0 || targetRect.height <= 0) return { ok: false, error: "Element ref ${ref} has zero size" }
  return { ok: true, x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2, tag: target.tagName.toLowerCase(), name: (target.getAttribute("aria-label") || target.textContent || "").trim().slice(0, 200), href: target.href || "" }
})()`
}

export function buildFocusScript(ref: number, expectedNamespace?: number) {
  return `(async () => {
   const registry = ${registryExpr()}
   if (${expectedNamespace === undefined ? "false" : `registry.namespace !== ${expectedNamespace}`}) return { ok: false, error: "Element ref ${ref} became stale; re-read the page" }
  const el = registry.resolve(${ref})
  if (!el) return { ok: false, error: "Element ref ${ref} is gone; re-read the page" }
  if (!el.isConnected) return { ok: false, error: "Element ref ${ref} is disconnected from DOM" }
  el.focus()
  return { ok: true, ref: ${ref}, tag: el.tagName.toLowerCase() }
})()`
}

export function buildReadElementScript(ref: number, expectedNamespace?: number) {
  return `(async () => {
   const registry = ${registryExpr()}
   if (${expectedNamespace === undefined ? "false" : `registry.namespace !== ${expectedNamespace}`}) return { ok: false, error: "Element ref ${ref} became stale; re-read the page" }
  const el = registry.resolve(${ref})
  if (!el) return { ok: false, error: "Element ref ${ref} is gone; re-read the page" }
  const value = el.value !== undefined ? String(el.value) : el.textContent || ""
  return { ok: true, value }
})()`
}

export function buildTypeScript(ref: number, text: string, expectedNamespace?: number) {
  return `(async () => {
   const registry = ${registryExpr()}
   if (${expectedNamespace === undefined ? "false" : `registry.namespace !== ${expectedNamespace}`}) return { ok: false, error: "Element ref ${ref} became stale; re-read the page" }
  const el = registry.resolve(${ref})
  if (!el) return { ok: false, error: "Element ref ${ref} is gone; re-read the page" }
  if (!el.isConnected) return { ok: false, error: "Element ref ${ref} is disconnected from DOM" }
  el.focus()
  const value = ${JSON.stringify(text)}
  if (el.isContentEditable) {
    el.textContent = value
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return { ok: true, ref: ${ref}, method: "contentEditable" }
  }
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value")
    if (!descriptor?.set) return { ok: false, error: "Element ref ${ref} has no writable value" }
    descriptor.set.call(el, value)
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return { ok: true, ref: ${ref}, value: el.value, method: "valueSetter" }
  }
  if (el.tagName === "SELECT") {
    const option = Array.from(el.options).find((candidate) => candidate.value === value || candidate.text === value)
    if (!option) return { ok: false, error: "No matching option for element ref ${ref}" }
    el.value = option.value
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return { ok: true, ref: ${ref}, value: el.value, method: "select" }
  }
  return { ok: false, error: "Element ref ${ref} is not editable (tag: " + el.tagName + ")" }
})()`
}

export function buildScrollScript(direction: "up" | "down" | "top" | "bottom", amount?: number) {
  const pixels = amount ?? (direction === "top" || direction === "bottom" ? 10000 : 300)
  const dir = direction === "up" ? -pixels : direction === "down" ? pixels : direction === "top" ? -10000 : 10000
  return `(() => {
  const before = { x: window.scrollX, y: window.scrollY }
  window.scrollBy(0, ${dir})
  const after = { x: window.scrollX, y: window.scrollY }
  return { ok: true, direction: ${JSON.stringify(direction)}, amount: ${pixels}, before, after }
})()`
}

export function buildHoverScript(ref: number, expectedNamespace?: number) {
  return `(async () => {
   const registry = ${registryExpr()}
   if (${expectedNamespace === undefined ? "false" : `registry.namespace !== ${expectedNamespace}`}) return { ok: false, error: "Element ref ${ref} became stale; re-read the page" }
  const el = registry.resolve(${ref})
  if (!el) return { ok: false, error: "Element ref ${ref} is gone" }
  el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }))
  el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }))
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  return { ok: true }
})()`
}

export function buildDragScript(fromRef: number, toRef: number, expectedNamespace?: number) {
  return `(async () => {
   const registry = ${registryExpr()}
   if (${expectedNamespace === undefined ? "false" : `registry.namespace !== ${expectedNamespace}`}) return { ok: false, error: "Element refs became stale; re-read the page" }
  const from = registry.resolve(${fromRef})
  const to = registry.resolve(${toRef})
  if (!from || !to) return { ok: false, error: "Element ref gone" }
  const rect1 = from.getBoundingClientRect()
  const rect2 = to.getBoundingClientRect()
  from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, clientX: rect1.x, clientY: rect1.y }))
  to.dispatchEvent(new DragEvent("dragover", { bubbles: true, clientX: rect2.x, clientY: rect2.y }))
  to.dispatchEvent(new DragEvent("drop", { bubbles: true, clientX: rect2.x, clientY: rect2.y }))
  from.dispatchEvent(new DragEvent("dragend", { bubbles: true }))
  return { ok: true }
})()`
}

export function buildClickAtScript(x: number, y: number) {
  return `(async () => {
  const selector = "a[href],button,input,select,textarea,summary,[role=button],[onclick],[tabindex]"
  const deepHit = (root) => {
    const candidates = [...root.querySelectorAll(selector)].filter((candidate) => { const rect = candidate.getBoundingClientRect(); return ${x} >= rect.left && ${x} <= rect.right && ${y} >= rect.top && ${y} <= rect.bottom })
    const hit = root === document ? document.elementFromPoint(${x}, ${y}) : (root.elementFromPoint?.(${x}, ${y}) || (candidates.length === 1 ? candidates[0] : null))
    return hit?.shadowRoot ? (deepHit(hit.shadowRoot) || hit) : hit
  }
  const hit = deepHit(document)
   const registry = ${registryExpr()}
  const el = hit && (hit.matches?.(selector) ? hit : hit.closest?.(selector))
  if (!el) return { ok: false, error: "No element at coordinates" }
  if (!(el instanceof HTMLElement)) return { ok: false, error: "No interactive element at coordinates" }
  return { ok: true, ref: registry.refFor(el), tag: el.tagName.toLowerCase(), id: el.id || "", name: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 80), href: el.href || el.closest?.("a[href]")?.href || "" }
})()`
}

export function buildClickAtProbeScript(x: number, y: number, expectedNamespace?: number) {
  return `(async () => {
  const selector = "a[href],button,input,select,textarea,summary,[role=button],[onclick],[tabindex]"
  const deepHit = (root) => {
    const candidates = [...root.querySelectorAll(selector)].filter((candidate) => { const rect = candidate.getBoundingClientRect(); return ${x} >= rect.left && ${x} <= rect.right && ${y} >= rect.top && ${y} <= rect.bottom })
    const hit = root === document ? document.elementFromPoint(${x}, ${y}) : (root.elementFromPoint?.(${x}, ${y}) || (candidates.length === 1 ? candidates[0] : null))
    return hit?.shadowRoot ? (deepHit(hit.shadowRoot) || hit) : hit
  }
  const hit = deepHit(document)
  const registry = ${registryExpr(expectedNamespace === undefined ? undefined : String(expectedNamespace))}
  if (${expectedNamespace === undefined ? "false" : `registry.namespace !== ${expectedNamespace}`}) return { ok: false, error: "Coordinate target became stale; re-read the page" }
  const el = hit && (hit.matches?.(selector) ? hit : hit.closest?.(selector))
  if (!el) return { ok: false, error: "No element at coordinates" }
  if (!(el instanceof HTMLElement)) return { ok: false, error: "No interactive element at coordinates" }
  if (el.disabled === true) return { ok: false, error: "Element at coordinates is disabled" }
  const hidden = (node) => { for (let depth = 0; node && depth < 64; depth++) { const style = getComputedStyle(node); if (node.getAttribute?.("aria-hidden") === "true" || node.getAttribute?.("aria-disabled") === "true" || node.hasAttribute?.("hidden") || node.hasAttribute?.("inert") || node.inert === true || (node.tagName === "FIELDSET" && node.disabled === true) || style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0 || style.pointerEvents === "none") return true; const root = node.getRootNode?.(); node = node.parentElement || (root instanceof ShadowRoot ? root.host : null) } return false }
  if (hidden(el)) return { ok: false, error: "Element at coordinates is inert" }
  const ref = registry.refFor(el)
  const key = "__opencodeDockClickProbe"
  const previous = window[key]
  if (previous?.cleanup) previous.cleanup()
  let fired = false
  const listener = (event) => {
    const target = event.target
     if (target === el || (target instanceof Node && el.contains(target)) || event.composedPath?.().includes(el)) fired = true
  }
  document.addEventListener("click", listener, true)
  window[key] = { fired: () => fired, cleanup: () => document.removeEventListener("click", listener, true) }
  return { ok: true, ref, tag: el.tagName.toLowerCase(), id: el.id || "", name: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 80), href: el.href || el.closest?.("a[href]")?.href || "" }
})()`
}

export function buildScrollToScript(x: number, y: number) {
  return `(() => { window.scrollTo(${x}, ${y}); return { ok: true, x: ${x}, y: ${y} } })()`
}

export function buildWaitScript(milliseconds: number) {
  return `(new Promise((resolve) => setTimeout(() => resolve({ ok: true, waitedMs: ${milliseconds} }), ${milliseconds})))`
}

export function buildKeyboardScript(type: "keyDown" | "keyUp", key: string) {
  return `(async () => {
  const event = new KeyboardEvent(${JSON.stringify(type === "keyDown" ? "keydown" : "keyup")}, {
    key: ${JSON.stringify(key)}, code: ${JSON.stringify(key)}, bubbles: true, cancelable: true,
  })
  const target = document.activeElement || document.body
  target.dispatchEvent(event)
  return {
    ok: true,
    type: ${JSON.stringify(type)},
    key: ${JSON.stringify(key)},
    activeTag: target.tagName.toLowerCase(),
    activeId: target.id || "",
  }
})()`
}
/**
 * Generates a script to set localStorage or sessionStorage.
 * @storage - "local" or "session" storage type
 * @returns Self-invoking async script snippet
 */
export function buildStorageScript(storage: "local" | "session", key: string) {
  const storageName = JSON.stringify(storage)
  const storageKey = JSON.stringify(key)
  return `(async () => {
  const store = ${storageName} === "local" ? window.localStorage : window.sessionStorage
  const value = store.getItem(${storageKey})
  return { ok: true, storage: ${storageName}, key: ${storageKey}, value }
})()`
}

/**
 * Generates a script to evaluate custom JavaScript.
 * @script - JavaScript string to evaluate
 * @returns Self-invoking async script snippet
 */
export function buildEvaluateScript(script: string) {
  return `(async () => {
  try {
    const result = await window.eval(${JSON.stringify(script)})
    return { ok: true, result: String(result) }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
})()`
}

/**
 * Generates a network request interceptor script.
 * @config - Configuration: blockUrls, allowedOrigins, blockMethods
 * @returns Self-invoking async script snippet
 */
export function buildNetworkScript(config: { blockUrls?: string[]; allowedOrigins?: string[]; blockMethods?: string[] }) {
  return `(async () => {
  const config = ${JSON.stringify(config)}
  const marker = "__opencodeDockNetwork"
  const previous = window[marker]
  if (previous) {
    window.fetch = previous.fetch
    XMLHttpRequest.prototype.open = previous.open
    XMLHttpRequest.prototype.send = previous.send
  }
  const state = previous?.state ?? { blocked: 0, requests: 0 }
  window.__appDockNetwork = state
  const blocked = (url, method) => {
    const parsed = new URL(url, location.href)
    const methodBlocked = !config.blockMethods?.length || config.blockMethods.includes(method.toUpperCase())
    const urlBlocked = config.blockUrls?.some((pattern) => parsed.href.includes(pattern) || parsed.origin === pattern)
    const originAllowed = config.allowedOrigins?.some((origin) => parsed.origin === origin)
    return Boolean(urlBlocked && methodBlocked && !originAllowed)
  }
  const originalFetch = window.fetch
  window.fetch = async function(input, init) {
    const request = new Request(input, init)
    state.requests++
    if (blocked(request.url, request.method)) {
      state.blocked++
      return new Response("Blocked by App Dock", { status: 403 })
    }
    return originalFetch.call(this, request)
  }
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function(method, url) {
    state.requests++
    this.__appDockBlocked = blocked(url, method)
    if (this.__appDockBlocked) state.blocked++
    return originalOpen.apply(this, arguments)
  }
  XMLHttpRequest.prototype.send = function(body) {
    if (this.__appDockBlocked) {
      this.abort()
      return
    }
    return originalSend.call(this, body)
  }
  if (config.probeUrl) {
    try { await window.fetch(config.probeUrl, { method: config.probeMethod || "GET" }) } catch (_) {}
  }
  window[marker] = { fetch: originalFetch, open: originalOpen, send: originalSend, state }
  return { ok: true, blocked: state.blocked, requests: state.requests, interceptorReady: true }
})()`
}
