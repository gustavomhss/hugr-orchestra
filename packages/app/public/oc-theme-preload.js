;(function () {
  function read(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {}
  }

  function drop(key) {
    try {
      localStorage.removeItem(key)
    } catch {}
  }

  const root = document.documentElement
  const own = ["system", "dark", "light"]

  // Orchestra shows only its own palettes. An inherited theme chosen before palettes existed becomes the palette
  // of the same name when one ships, and Orchestra Dark otherwise.
  const legacy = read("orchestra-theme-id")
  const stored = read("orchestra-palette")
  const requested = stored || (legacy && legacy !== "oc-1" && legacy !== "oc-2" ? legacy : null)
  if (legacy && legacy !== "oc-2") {
    write("orchestra-theme-id", "oc-2")
    drop("orchestra-theme-css-light")
    drop("orchestra-theme-css-dark")
  }

  // A recolored palette's first-paint rules are inlined before this script; they name the palette's scheme.
  if (requested && !own.includes(requested)) {
    root.dataset.orchestraPalette = requested
    const scheme = getComputedStyle(root).getPropertyValue("--orchestra-palette-scheme").trim()
    if (scheme === "dark" || scheme === "light") {
      write("orchestra-palette", requested)
      write("orchestra-color-scheme", scheme)
    }
    if (scheme !== "dark" && scheme !== "light") {
      // Unknown or removed palette: Orchestra Dark.
      delete root.dataset.orchestraPalette
      write("orchestra-palette", "dark")
      write("orchestra-color-scheme", "dark")
    }
  }

  const savedScheme = read("orchestra-color-scheme")
  const scheme = savedScheme === "dark" || savedScheme === "light" ? savedScheme : "system"
  const isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  const mode = isDark ? "dark" : "light"

  root.dataset.theme = "oc-2"
  root.dataset.colorScheme = mode
  // Orchestra is the default shell. Settings reconcile this marker with the body after mount.
  root.toggleAttribute("data-new-layout", true)
  root.style.colorScheme = mode

  const style = getComputedStyle(root)
  root.style.backgroundColor =
    style.getPropertyValue("--app-background").trim() ||
    style.getPropertyValue("--v2-background-bg-deep").trim() ||
    (isDark ? "#080c11" : "#dfe3e8")
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", getComputedStyle(root).backgroundColor)
})()
