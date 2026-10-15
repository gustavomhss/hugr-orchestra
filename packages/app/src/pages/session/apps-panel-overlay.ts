// The App Dock browser is a native view that paints above every HTML layer, so a dialog, popover,
// menu or toast drawn over the Dock would sit behind the browser and never get its clicks. Kobalte
// and Solid portals mount each open overlay in its own container directly under <body>, so watching
// body's children sees every overlay primitive without each one opting in. Overlays drawn inside
// the app tree instead of a portal register themselves.
export function createAppDockOverlayWatch(options: {
  body: HTMLElement
  target: () => Element | undefined
  change: (covered: boolean) => void
  requestAnimationFrame: (callback: () => void) => number
  cancelAnimationFrame: (frame: number) => void
}) {
  const local = new Set<Element>()
  let covered: boolean | undefined
  let frame: number | undefined
  const overlays = (target: Element) => [
    ...[...options.body.children].filter((element) => !element.contains(target)),
    ...local,
  ]
  const measure = () => {
    frame = undefined
    const target = options.target()
    const elements = target ? overlays(target) : []
    // Positioned overlays move after they mount, so their later layout changes measure again.
    elements.forEach((element) =>
      observer.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: watched }),
    )
    const area = target?.getBoundingClientRect()
    // Tooltips ignore the pointer and only follow hover; hiding the browser for one would flicker it.
    const next =
      !!area &&
      elements.some(
        (element) => !element.querySelector('[role="tooltip"]') && boxes(element).some((box) => intersects(box, area)),
      )
    if (next === covered) return
    covered = next
    options.change(next)
  }
  const request = () => {
    if (frame === undefined) frame = options.requestAnimationFrame(measure)
  }
  const observer = new MutationObserver(request)
  observer.observe(options.body, { childList: true })
  // A window resize moves the Dock under overlays that stay put, such as toasts.
  window.addEventListener("resize", request)
  return {
    request,
    // Measure now, so a native view about to be shown already knows whether an overlay covers it.
    sync() {
      if (frame !== undefined) options.cancelAnimationFrame(frame)
      measure()
    },
    register(element: Element) {
      local.add(element)
      request()
      return () => {
        local.delete(element)
        request()
      }
    },
  }
}

const watched = ["style", "class", "hidden"]

// Portal containers and static wrappers have no size of their own while their fixed-position
// content does, so descend until a rendered box is found.
function boxes(element: Element): DOMRect[] {
  const box = element.getBoundingClientRect()
  if (box.width > 0 && box.height > 0) return [box]
  if (getComputedStyle(element).display === "none") return []
  return [...element.children].flatMap(boxes)
}

function intersects(left: DOMRect, right: DOMRect) {
  return left.left < right.right && right.left < left.right && left.top < right.bottom && right.top < left.bottom
}
