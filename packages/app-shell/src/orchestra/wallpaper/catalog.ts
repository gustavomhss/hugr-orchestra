// The photos the workspace can show behind the glass, and the theme each one carries.
//
// `orchestra` is the default backdrop and has no theme: the palette owns its material, exactly as before.
// Every other photo brings its own material (veil, glass tint, glass alpha, blur, brightness) and its own
// ink (text, accent, hairlines) for both color schemes. The values come from the study in
// ~/Downloads/wallpaper-theme-study.md: each one is solved against the app's ink colors so the body text
// keeps 4.5:1 over the photo's brightest band and 3.2:1 over its hotspot.

export type WallpaperMaterial = {
  /** The glass tint, as an "R G B" triplet so CSS can compose it with an alpha. */
  tint: string
  alpha: number
  blur: number
  brightness: number
  saturate: number
  /** The veil over the photo, as an "R G B" triplet; it darkens the frame under the glass. */
  veil: string
  veilTop: number
  veilBottom: number
}

export type WallpaperPalette = {
  strong: string
  body: string
  muted: string
  faint: string
  accent: string
  accentDim: string
  line: string
}

export type WallpaperTheme = {
  dark: { material: WallpaperMaterial; palette: WallpaperPalette }
  light: { material: WallpaperMaterial; palette: WallpaperPalette }
}

export type Wallpaper = { id: string; src: string; thumb: string; theme?: WallpaperTheme }

const BASE = "/orchestra/wallpapers"

export const WALLPAPERS = [
  {
    id: "orchestra",
    src: "/orchestra/mtn-src.jpg",
    thumb: "/orchestra/mtn-src.jpg",
  },
  {
    id: "dunes",
    src: `/orchestra/wallpapers/dunes.jpg`,
    thumb: `/orchestra/wallpapers/thumb-dunes.jpg`,
    theme: {
      dark: {
        material: {
          tint: "33 13 16",
          alpha: 0.72,
          blur: 22,
          brightness: 1.15,
          saturate: 0.9,
          veil: "20 8 10",
          veilTop: 0.2,
          veilBottom: 0.1,
        },
        palette: {
          strong: "#e9e4e4",
          body: "#c4b4b6",
          muted: "#a09395",
          faint: "#817678",
          accent: "#d7aeb3",
          accentDim: "#bc898f",
          line: "rgba(233, 228, 228, 0.16)",
        },
      },
      light: {
        material: {
          tint: "235 224 226",
          alpha: 0.26,
          blur: 26,
          brightness: 1.6,
          saturate: 0.75,
          veil: "247 243 243",
          veilTop: 0.35,
          veilBottom: 0.45,
        },
        palette: {
          strong: "#403536",
          body: "#614f51",
          muted: "#554547",
          faint: "#45383a",
          accent: "#8a3842",
          accentDim: "#ad515c",
          line: "rgba(64, 53, 54, 0.18)",
        },
      },
    },
  },
  {
    id: "photo-4",
    src: `/orchestra/wallpapers/photo-4.jpg`,
    thumb: `/orchestra/wallpapers/thumb-photo-4.jpg`,
    theme: {
      dark: {
        material: {
          tint: "15 22 31",
          alpha: 0.72,
          blur: 24,
          brightness: 0.65,
          saturate: 0.9,
          veil: "8 13 20",
          veilTop: 0.0,
          veilBottom: 0.1,
        },
        palette: {
          strong: "#d2d6da",
          body: "#a4acb7",
          muted: "#868d96",
          faint: "#6c7178",
          accent: "#95aecb",
          accentDim: "#708caf",
          line: "rgba(210, 214, 218, 0.16)",
        },
      },
      light: {
        material: {
          tint: "225 229 234",
          alpha: 0.22,
          blur: 26,
          brightness: 1.6,
          saturate: 0.75,
          veil: "243 245 247",
          veilTop: 0.25,
          veilBottom: 0.1,
        },
        palette: {
          strong: "#343a40",
          body: "#4f5760",
          muted: "#454c54",
          faint: "#383e45",
          accent: "#355782",
          accentDim: "#4c73a2",
          line: "rgba(52, 58, 64, 0.18)",
        },
      },
    },
  },
  {
    id: "storm",
    src: `/orchestra/wallpapers/storm.jpg`,
    thumb: `/orchestra/wallpapers/thumb-storm.jpg`,
    theme: {
      dark: {
        material: {
          tint: "17 21 29",
          alpha: 0.72,
          blur: 20,
          brightness: 0.75,
          saturate: 0.9,
          veil: "8 13 20",
          veilTop: 0.4,
          veilBottom: 0.0,
        },
        palette: {
          strong: "#d0d4d9",
          body: "#a3abb7",
          muted: "#858c96",
          faint: "#6b7078",
          accent: "#97abcc",
          accentDim: "#748bb1",
          line: "rgba(208, 212, 217, 0.16)",
        },
      },
      light: {
        material: {
          tint: "226 229 233",
          alpha: 0.2,
          blur: 26,
          brightness: 1.5,
          saturate: 0.75,
          veil: "243 244 247",
          veilTop: 0.25,
          veilBottom: 0.6,
        },
        palette: {
          strong: "#393e46",
          body: "#535a65",
          muted: "#494f58",
          faint: "#3b4048",
          accent: "#3a598f",
          accentDim: "#5374ae",
          line: "rgba(57, 62, 70, 0.18)",
        },
      },
    },
  },
  {
    id: "jonatan-pie",
    src: `/orchestra/wallpapers/jonatan-pie.jpg`,
    thumb: `/orchestra/wallpapers/thumb-jonatan-pie.jpg`,
    theme: {
      dark: {
        material: {
          tint: "14 25 32",
          alpha: 0.7,
          blur: 22,
          brightness: 1.2,
          saturate: 0.9,
          veil: "8 16 20",
          veilTop: 0.0,
          veilBottom: 0.0,
        },
        palette: {
          strong: "#cbd1d5",
          body: "#9caab1",
          muted: "#7f8b91",
          faint: "#667074",
          accent: "#85acc3",
          accentDim: "#618da6",
          line: "rgba(203, 209, 213, 0.16)",
        },
      },
      light: {
        material: {
          tint: "224 231 235",
          alpha: 0.2,
          blur: 26,
          brightness: 1.4,
          saturate: 0.75,
          veil: "243 245 247",
          veilTop: 0.55,
          veilBottom: 0.55,
        },
        palette: {
          strong: "#32393d",
          body: "#4b565c",
          muted: "#424b50",
          faint: "#363d42",
          accent: "#2e5871",
          accentDim: "#447591",
          line: "rgba(50, 57, 61, 0.18)",
        },
      },
    },
  },
  {
    id: "leo",
    src: `/orchestra/wallpapers/leo.jpg`,
    thumb: `/orchestra/wallpapers/thumb-leo.jpg`,
    theme: {
      dark: {
        material: {
          tint: "15 20 31",
          alpha: 0.72,
          blur: 25,
          brightness: 1.0,
          saturate: 0.9,
          veil: "8 12 20",
          veilTop: 0.35,
          veilBottom: 0.0,
        },
        palette: {
          strong: "#bdc0c9",
          body: "#949bab",
          muted: "#797f8c",
          faint: "#616670",
          accent: "#879ac4",
          accentDim: "#677ba9",
          line: "rgba(189, 192, 201, 0.16)",
        },
      },
      light: {
        material: {
          tint: "225 228 234",
          alpha: 0.2,
          blur: 26,
          brightness: 1.5,
          saturate: 0.75,
          veil: "243 244 247",
          veilTop: 0.5,
          veilBottom: 0.6,
        },
        palette: {
          strong: "#393c45",
          body: "#535966",
          muted: "#494e59",
          faint: "#3b4049",
          accent: "#3c5794",
          accentDim: "#5872b0",
          line: "rgba(57, 60, 69, 0.18)",
        },
      },
    },
  },
  {
    id: "leo-visions",
    src: `/orchestra/wallpapers/leo-visions.jpg`,
    thumb: `/orchestra/wallpapers/thumb-leo-visions.jpg`,
    theme: {
      dark: {
        material: {
          tint: "24 28 17",
          alpha: 0.72,
          blur: 20,
          brightness: 0.9,
          saturate: 0.9,
          veil: "15 20 8",
          veilTop: 0.0,
          veilBottom: 0.2,
        },
        palette: {
          strong: "#e8e9e5",
          body: "#b8bfad",
          muted: "#969c8d",
          faint: "#797e72",
          accent: "#adc488",
          accentDim: "#87a35b",
          line: "rgba(232, 233, 229, 0.16)",
        },
      },
      light: {
        material: {
          tint: "230 233 226",
          alpha: 0.2,
          blur: 26,
          brightness: 1.6,
          saturate: 0.75,
          veil: "245 247 243",
          veilTop: 0.2,
          veilBottom: 0.55,
        },
        palette: {
          strong: "#373b30",
          body: "#515848",
          muted: "#474d3f",
          faint: "#3a3f33",
          accent: "#475c26",
          accentDim: "#607838",
          line: "rgba(55, 59, 48, 0.18)",
        },
      },
    },
  },
  {
    id: "sergey-pesterev",
    src: `/orchestra/wallpapers/sergey-pesterev.jpg`,
    thumb: `/orchestra/wallpapers/thumb-sergey-pesterev.jpg`,
    theme: {
      dark: {
        material: {
          tint: "14 24 32",
          alpha: 0.72,
          blur: 26,
          brightness: 0.75,
          saturate: 0.9,
          veil: "8 15 20",
          veilTop: 0.35,
          veilBottom: 0.2,
        },
        palette: {
          strong: "#f5f6f7",
          body: "#c1c9cf",
          muted: "#9ea4a9",
          faint: "#7f8488",
          accent: "#b5cbda",
          accentDim: "#89a7bd",
          line: "rgba(245, 246, 247, 0.16)",
        },
      },
      light: {
        material: {
          tint: "224 230 235",
          alpha: 0.2,
          blur: 29,
          brightness: 1.4,
          saturate: 0.75,
          veil: "243 245 247",
          veilTop: 0.0,
          veilBottom: 0.0,
        },
        palette: {
          strong: "#353c41",
          body: "#4e5860",
          muted: "#444d54",
          faint: "#383f45",
          accent: "#325b79",
          accentDim: "#477698",
          line: "rgba(53, 60, 65, 0.18)",
        },
      },
    },
  },
] as const satisfies readonly Wallpaper[]

export type WallpaperID = (typeof WALLPAPERS)[number]["id"]

export const WALLPAPER_DEFAULT: WallpaperID = "orchestra"
export const WALLPAPER_DIM_MAX = 0.8

export function wallpaperSrc(id: string) {
  return WALLPAPERS.find((item) => item.id === id)?.src
}

/** The theme a photo brings, in the given color scheme. The default backdrop brings none. */
export function wallpaperTheme(id: string, scheme: "dark" | "light") {
  const wallpaper: Wallpaper | undefined = WALLPAPERS.find((item) => item.id === id)
  return wallpaper?.theme?.[scheme]
}

/** Clamp a persisted or user-provided dim value to the valid range. */
export function clampWallpaperDim(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(WALLPAPER_DIM_MAX, Math.max(0, n))
}
