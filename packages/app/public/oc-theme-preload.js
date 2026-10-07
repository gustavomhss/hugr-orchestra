;(function () {
  function read(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  const key = "orchestra-theme-id"
  const savedTheme = read(key) || "oc-2"
  const themeId = savedTheme === "oc-1" ? "oc-2" : savedTheme

  if (savedTheme === "oc-1") {
    try {
      localStorage.setItem(key, themeId)
      localStorage.removeItem("orchestra-theme-css-light")
      localStorage.removeItem("orchestra-theme-css-dark")
    } catch {}
  }

  const savedScheme = read("orchestra-color-scheme")
  const scheme = savedScheme === "dark" || savedScheme === "light" ? savedScheme : "system"
  const isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  const mode = isDark ? "dark" : "light"
  const root = document.documentElement

  root.dataset.theme = themeId
  root.dataset.colorScheme = mode
  // Orchestra is the default shell. Settings reconcile this marker with the body after mount.
  root.toggleAttribute("data-new-layout", true)
  root.style.colorScheme = mode

  const css = themeId === "oc-2" ? null : read("orchestra-theme-css-" + mode)
  if (css) {
    const style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }

  const style = getComputedStyle(root)
  root.style.backgroundColor =
    style.getPropertyValue("--app-background").trim() ||
    style.getPropertyValue("--v2-background-bg-deep").trim() ||
    (isDark ? "#080808" : "#fafafa")
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", getComputedStyle(root).backgroundColor)
})()
