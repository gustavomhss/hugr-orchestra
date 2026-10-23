/* Drives the wallpaper preview: every photo carries its own material (veil, glass tint, alpha, blur,
   brightness) and its own palette (ink, accent, lines), for both color schemes. The tokens come from the
   study in ~/Downloads/wallpaper-theme-study.md and are solved against the app's real ink colors. */

const PHOTO_DIR = "../../../packages/app-shell/public/orchestra/wallpapers/"
const DEFAULT_PHOTO = "../../../packages/app-shell/public/orchestra/mtn-src.jpg"

/** The app's global material, unchanged: the photo swaps, the glass does not. */
const TODAY = {
  dark: {
    material: { alpha: 0.77, brightness: 1, saturate: 1, blur: 24, veilTop: 0, veilBottom: 0, tint: "#0d1721", veil: "#090e14" },
    palette: null,
  },
  light: {
    material: { alpha: 0.82, brightness: 1.04, saturate: 0.96, blur: 18, veilTop: 0, veilBottom: 0, tint: "#f2f6fa", veil: "#ffffff" },
    palette: null,
  },
}

/** One theme per photo, per scheme. */
const THEMES = {
  "dunes": {
    label: "dunes",
    dark: {
    material: {
      alpha: 0.72,
      brightness: 1.15,
      saturate: 0.9,
      blur: 22,
      veilTop: 0.2,
      veilBottom: 0.1,
      tint: "#210d10",
      veil: "#14080a",
    },
    palette: {
      strong: "#e9e4e4",
      dim: "#c4b4b6",
      accent: "#d7aeb3",
      accentDim: "#bc898f",
      line: "rgba(153,164,182,0.16)",
      soft: "rgba(144,155,177,0.06)",
      raised: "rgba(56,22,28,0.66)",
      modal: "#451b23",
      primary: "linear-gradient(180deg, rgba(215,174,179,0.92), rgba(188,137,143,0.96))",
      enabled: "rgba(215,174,179,0.16)",
    },
    measured: { body: 5.68, hotspot: 3.09 },
    },
    light: {
    material: {
      alpha: 0.26,
      brightness: 1.6,
      saturate: 0.75,
      blur: 26,
      veilTop: 0.35,
      veilBottom: 0.45,
      tint: "#ebe0e2",
      veil: "#f7f3f3",
    },
    palette: {
      strong: "#403536",
      dim: "#614f51",
      accent: "#8a3842",
      accentDim: "#ad515c",
      line: "rgba(35,29,29,0.18)",
      soft: "rgba(32,26,27,0.06)",
      raised: "rgba(248,250,252,0.72)",
      modal: "#f8fafc",
      primary: "linear-gradient(180deg, rgba(138,56,66,0.92), rgba(173,81,92,0.96))",
      enabled: "rgba(138,56,66,0.14)",
    },
    measured: { body: 4.53, hotspot: 4.53 },
    },
  },
  "photo-4": {
    label: "photo-4",
    dark: {
    material: {
      alpha: 0.72,
      brightness: 0.65,
      saturate: 0.9,
      blur: 24,
      veilTop: 0.0,
      veilBottom: 0.1,
      tint: "#0f161f",
      veil: "#080d14",
    },
    palette: {
      strong: "#d2d6da",
      dim: "#a4acb7",
      accent: "#95aecb",
      accentDim: "#708caf",
      line: "rgba(138,154,174,0.16)",
      soft: "rgba(130,145,170,0.06)",
      raised: "rgba(25,37,55,0.66)",
      modal: "#1f2e44",
      primary: "linear-gradient(180deg, rgba(149,174,203,0.92), rgba(112,140,175,0.96))",
      enabled: "rgba(149,174,203,0.16)",
    },
    measured: { body: 6.6, hotspot: 3.73 },
    },
    light: {
    material: {
      alpha: 0.22,
      brightness: 1.6,
      saturate: 0.75,
      blur: 26,
      veilTop: 0.25,
      veilBottom: 0.1,
      tint: "#e1e5ea",
      veil: "#f3f5f7",
    },
    palette: {
      strong: "#343a40",
      dim: "#4f5760",
      accent: "#355782",
      accentDim: "#4c73a2",
      line: "rgba(28,31,35,0.18)",
      soft: "rgba(26,29,32,0.06)",
      raised: "rgba(248,250,252,0.72)",
      modal: "#f8fafc",
      primary: "linear-gradient(180deg, rgba(53,87,130,0.92), rgba(76,115,162,0.96))",
      enabled: "rgba(53,87,130,0.14)",
    },
    measured: { body: 4.66, hotspot: 4.66 },
    },
  },
  "storm": {
    label: "storm",
    dark: {
    material: {
      alpha: 0.72,
      brightness: 0.75,
      saturate: 0.9,
      blur: 20,
      veilTop: 0.4,
      veilBottom: 0.0,
      tint: "#11151d",
      veil: "#080d14",
    },
    palette: {
      strong: "#d0d4d9",
      dim: "#a3abb7",
      accent: "#97abcc",
      accentDim: "#748bb1",
      line: "rgba(137,152,173,0.16)",
      soft: "rgba(128,144,169,0.06)",
      raised: "rgba(28,35,52,0.66)",
      modal: "#232c3f",
      primary: "linear-gradient(180deg, rgba(151,171,204,0.92), rgba(116,139,177,0.96))",
      enabled: "rgba(151,171,204,0.16)",
    },
    measured: { body: 6.7, hotspot: 3.18 },
    },
    light: {
    material: {
      alpha: 0.2,
      brightness: 1.5,
      saturate: 0.75,
      blur: 26,
      veilTop: 0.25,
      veilBottom: 0.6,
      tint: "#e2e5e9",
      veil: "#f3f4f7",
    },
    palette: {
      strong: "#393e46",
      dim: "#535a65",
      accent: "#3a598f",
      accentDim: "#5374ae",
      line: "rgba(31,34,38,0.18)",
      soft: "rgba(28,31,35,0.06)",
      raised: "rgba(248,250,252,0.72)",
      modal: "#f8fafc",
      primary: "linear-gradient(180deg, rgba(58,89,143,0.92), rgba(83,116,174,0.96))",
      enabled: "rgba(58,89,143,0.14)",
    },
    measured: { body: 4.94, hotspot: 4.94 },
    },
  },
  "jonatan-pie": {
    label: "jonatan-pie",
    dark: {
    material: {
      alpha: 0.7,
      brightness: 1.2,
      saturate: 0.9,
      blur: 22,
      veilTop: 0.0,
      veilBottom: 0.0,
      tint: "#0e1920",
      veil: "#081014",
    },
    palette: {
      strong: "#cbd1d5",
      dim: "#9caab1",
      accent: "#85acc3",
      accentDim: "#618da6",
      line: "rgba(133,150,170,0.16)",
      soft: "rgba(125,142,166,0.06)",
      raised: "rgba(23,42,57,0.66)",
      modal: "#1d3446",
      primary: "linear-gradient(180deg, rgba(133,172,195,0.92), rgba(97,141,166,0.96))",
      enabled: "rgba(133,172,195,0.16)",
    },
    measured: { body: 6.9, hotspot: 3.22 },
    },
    light: {
    material: {
      alpha: 0.2,
      brightness: 1.4,
      saturate: 0.75,
      blur: 26,
      veilTop: 0.55,
      veilBottom: 0.55,
      tint: "#e0e7eb",
      veil: "#f3f5f7",
    },
    palette: {
      strong: "#32393d",
      dim: "#4b565c",
      accent: "#2e5871",
      accentDim: "#447591",
      line: "rgba(27,31,33,0.18)",
      soft: "rgba(25,28,30,0.06)",
      raised: "rgba(248,250,252,0.72)",
      modal: "#f8fafc",
      primary: "linear-gradient(180deg, rgba(46,88,113,0.92), rgba(68,117,145,0.96))",
      enabled: "rgba(46,88,113,0.14)",
    },
    measured: { body: 4.58, hotspot: 4.58 },
    },
  },
  "leo": {
    label: "leo",
    dark: {
    material: {
      alpha: 0.72,
      brightness: 1.0,
      saturate: 0.9,
      blur: 25,
      veilTop: 0.35,
      veilBottom: 0.0,
      tint: "#0f141f",
      veil: "#080c14",
    },
    palette: {
      strong: "#bdc0c9",
      dim: "#949bab",
      accent: "#879ac4",
      accentDim: "#677ba9",
      line: "rgba(124,138,160,0.16)",
      soft: "rgba(117,130,156,0.06)",
      raised: "rgba(25,34,55,0.66)",
      modal: "#1f2a44",
      primary: "linear-gradient(180deg, rgba(135,154,196,0.92), rgba(103,123,169,0.96))",
      enabled: "rgba(135,154,196,0.16)",
    },
    measured: { body: 8.12, hotspot: 3.43 },
    },
    light: {
    material: {
      alpha: 0.2,
      brightness: 1.5,
      saturate: 0.75,
      blur: 26,
      veilTop: 0.5,
      veilBottom: 0.6,
      tint: "#e1e4ea",
      veil: "#f3f4f7",
    },
    palette: {
      strong: "#393c45",
      dim: "#535966",
      accent: "#3c5794",
      accentDim: "#5872b0",
      line: "rgba(31,33,37,0.18)",
      soft: "rgba(28,30,34,0.06)",
      raised: "rgba(248,250,252,0.72)",
      modal: "#f8fafc",
      primary: "linear-gradient(180deg, rgba(60,87,148,0.92), rgba(88,114,176,0.96))",
      enabled: "rgba(60,87,148,0.14)",
    },
    measured: { body: 4.89, hotspot: 4.89 },
    },
  },
  "leo-visions": {
    label: "leo-visions",
    dark: {
    material: {
      alpha: 0.72,
      brightness: 0.9,
      saturate: 0.9,
      blur: 20,
      veilTop: 0.0,
      veilBottom: 0.2,
      tint: "#181c11",
      veil: "#0f1408",
    },
    palette: {
      strong: "#e8e9e5",
      dim: "#b8bfad",
      accent: "#adc488",
      accentDim: "#87a35b",
      line: "rgba(153,167,183,0.16)",
      soft: "rgba(143,158,178,0.06)",
      raised: "rgba(40,47,30,0.66)",
      modal: "#323a25",
      primary: "linear-gradient(180deg, rgba(173,196,136,0.92), rgba(135,163,91,0.96))",
      enabled: "rgba(173,196,136,0.16)",
    },
    measured: { body: 5.47, hotspot: 3.7 },
    },
    light: {
    material: {
      alpha: 0.2,
      brightness: 1.6,
      saturate: 0.75,
      blur: 26,
      veilTop: 0.2,
      veilBottom: 0.55,
      tint: "#e6e9e2",
      veil: "#f5f7f3",
    },
    palette: {
      strong: "#373b30",
      dim: "#515848",
      accent: "#475c26",
      accentDim: "#607838",
      line: "rgba(30,32,26,0.18)",
      soft: "rgba(27,29,24,0.06)",
      raised: "rgba(248,250,252,0.72)",
      modal: "#f8fafc",
      primary: "linear-gradient(180deg, rgba(71,92,38,0.92), rgba(96,120,56,0.96))",
      enabled: "rgba(71,92,38,0.14)",
    },
    measured: { body: 4.65, hotspot: 4.65 },
    },
  },
  "sergey-pesterev": {
    label: "sergey-pesterev",
    dark: {
    material: {
      alpha: 0.72,
      brightness: 0.75,
      saturate: 0.9,
      blur: 26,
      veilTop: 0.35,
      veilBottom: 0.2,
      tint: "#0e1820",
      veil: "#080f14",
    },
    palette: {
      strong: "#f5f6f7",
      dim: "#c1c9cf",
      accent: "#b5cbda",
      accentDim: "#89a7bd",
      line: "rgba(161,177,197,0.16)",
      soft: "rgba(151,167,192,0.06)",
      raised: "rgba(23,40,57,0.66)",
      modal: "#1d3246",
      primary: "linear-gradient(180deg, rgba(181,203,218,0.92), rgba(137,167,189,0.96))",
      enabled: "rgba(181,203,218,0.16)",
    },
    measured: { body: 4.84, hotspot: 3.63 },
    },
    light: {
    material: {
      alpha: 0.2,
      brightness: 1.4,
      saturate: 0.75,
      blur: 29,
      veilTop: 0.0,
      veilBottom: 0.0,
      tint: "#e0e6eb",
      veil: "#f3f5f7",
    },
    palette: {
      strong: "#353c41",
      dim: "#4e5860",
      accent: "#325b79",
      accentDim: "#477698",
      line: "rgba(29,33,35,0.18)",
      soft: "rgba(26,30,32,0.06)",
      raised: "rgba(248,250,252,0.72)",
      modal: "#f8fafc",
      primary: "linear-gradient(180deg, rgba(50,91,121,0.92), rgba(71,118,152,0.96))",
      enabled: "rgba(50,91,121,0.14)",
    },
    measured: { body: 4.78, hotspot: 4.78 },
    },
  },
}

const state = { photo: "dunes", variant: "tema", dim: 0 }

const root = document.documentElement
const body = document.body

function alpha(hex, a) {
  const value = hex.replace("#", "")
  const n = parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function scheme() {
  return root.dataset.colorScheme === "light" ? "light" : "dark"
}

function apply() {
  const current = scheme()
  const theme = state.variant === "hoje" ? TODAY[current] : THEMES[state.photo][current]
  const material = theme.material
  const photo = state.photo === "orchestra" ? DEFAULT_PHOTO : `${PHOTO_DIR}${state.photo}.jpg`
  root.style.setProperty("--wp-photo", `url("${photo}")`)
  root.style.setProperty(
    "--wp-veil",
    `linear-gradient(${alpha(material.veil, material.veilTop)}, ${alpha(material.veil, material.veilBottom)})`,
  )
  root.style.setProperty("--wp-dim", String(state.dim))
  root.style.setProperty(
    "--wp-glass",
    `linear-gradient(180deg, ${alpha(material.tint, material.alpha)} 0%, ${alpha(material.tint, material.alpha * 0.94)} 46%, ${alpha(material.tint, material.alpha * 1.06)} 100%)`,
  )
  root.style.setProperty("--wp-side", alpha(material.tint, Math.round(material.alpha * 0.6 * 100) / 100))
  root.style.setProperty("--wp-filter", `blur(${material.blur}px) brightness(${material.brightness}) saturate(${material.saturate})`)

  // The kit tokens live on the body, so the palette overrides go inline on it.
  const palette = theme.palette
  if (palette) {
    body.style.setProperty("--mx-strong", palette.strong)
    body.style.setProperty("--mx-dim", palette.dim)
    body.style.setProperty("--mx-blue", palette.accent)
    body.style.setProperty("--mx-line", palette.line)
    body.style.setProperty("--mx-soft", palette.soft)
    body.style.setProperty("--mx-raised", palette.raised)
    body.style.setProperty("--mx-modal", palette.modal)
    body.style.setProperty("--mx-primary", palette.primary)
    body.style.setProperty("--mx-enabled", palette.enabled)
    body.style.setProperty("--mx-highlight", "inset 0 1px 0 rgba(255, 255, 255, 0.045)")
  } else {
    for (const name of ["--mx-strong", "--mx-dim", "--mx-blue", "--mx-line", "--mx-soft", "--mx-raised", "--mx-modal", "--mx-primary", "--mx-enabled", "--mx-highlight"])
      body.style.removeProperty(name)
  }
  render(theme, current)
}

function render(theme, current) {
  const material = theme.material
  document.getElementById("wp-tokens").innerHTML = [
    ["scheme", current],
    ["photo", state.photo],
    ["material", state.variant === "hoje" ? "global (hoje)" : "tema próprio"],
    ["glass α", material.alpha],
    ["blur", `${material.blur}px`],
    ["brightness", material.brightness],
    ["saturate", material.saturate],
    ["veil", `${material.veilTop} → ${material.veilBottom}`],
    ["accent", theme.palette ? theme.palette.accent : "—"],
    ["ink", theme.palette ? theme.palette.dim : "—"],
  ]
    .map(([k, v]) => `<span>${k}</span><b>${v}</b>`)
    .join("")
  const readout = document.getElementById("wp-readout")
  if (!theme.measured) {
    readout.innerHTML = `<span class="warn">material global: sem ajuste por foto</span>`
    return
  }
  const grade = (value, floor) => (value >= floor ? "pass" : value >= floor - 1 ? "warn" : "bad")
  readout.innerHTML = [
    `<span class="${grade(theme.measured.body, 4.5)}">corpo ${theme.measured.body.toFixed(1)}:1</span>`,
    `<span class="${grade(theme.measured.hotspot, 3)}">hotspot ${theme.measured.hotspot.toFixed(1)}:1</span>`,
  ].join("")
}

function panel() {
  const el = document.createElement("div")
  el.className = "wp-panel"
  el.innerHTML = `
    <h3>WALLPAPER THEME</h3>
    <div class="wp-thumbs" id="wp-thumbs"></div>
    <div class="wp-variants" id="wp-variants"></div>
    <div class="wp-row"><label for="wp-dim">Darken</label><input id="wp-dim" type="range" min="0" max="80" step="5" value="0" /><b id="wp-dimv">0%</b></div>
    <h3>MEDIDO</h3>
    <div class="wp-readout" id="wp-readout"></div>
    <h3>TOKENS</h3>
    <div class="wp-tokens" id="wp-tokens"></div>`
  document.body.append(el)

  const thumbs = el.querySelector("#wp-thumbs")
  for (const id of ["orchestra", ...Object.keys(THEMES)]) {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.photo = id
    button.setAttribute("aria-pressed", String(id === state.photo))
    button.title = id
    const img = document.createElement("img")
    img.src = id === "orchestra" ? DEFAULT_PHOTO : `${PHOTO_DIR}thumb-${id}.jpg`
    img.alt = id
    button.append(img)
    button.addEventListener("click", () => {
      state.photo = id
      thumbs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.photo === id)))
      apply()
    })
    thumbs.append(button)
  }

  const variants = el.querySelector("#wp-variants")
  for (const [id, label] of [["hoje", "hoje"], ["tema", "tema próprio"]]) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = label
    button.setAttribute("aria-pressed", String(id === state.variant))
    button.addEventListener("click", () => {
      state.variant = id
      variants.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === label)))
      apply()
    })
    variants.append(button)
  }

  const dim = el.querySelector("#wp-dim")
  const dimv = el.querySelector("#wp-dimv")
  dim.addEventListener("input", () => {
    state.dim = Number(dim.value) / 100
    dimv.textContent = `${dim.value}%`
    apply()
  })
}

// The mock's Light / dark button flips the scheme on the html element.
new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["data-color-scheme"] })

panel()
apply()
