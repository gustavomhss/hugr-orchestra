// Scripted scrolling is not covered by the CSS reduced-motion rules, so it asks here. Read at call time because
// the person can change the system setting while the app is open.
export function reducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function smoothScroll(): ScrollBehavior {
  return reducedMotion() ? "auto" : "smooth"
}
