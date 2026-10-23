// The photos the workspace can show behind the glass. `orchestra` is the default backdrop; the rest ship in
// public/orchestra/wallpapers. Palette contrast is measured against `orchestra` only, so the picker pairs every
// photo with the darken control.
export type Wallpaper = { id: string; src: string; thumb: string }

const BASE = "/orchestra/wallpapers"

export const WALLPAPERS = [
  { id: "orchestra", src: "/orchestra/mtn-src.jpg", thumb: "/orchestra/mtn-src.jpg" },
  { id: "photo-1", src: `${BASE}/photo-1.jpg`, thumb: `${BASE}/thumb-photo-1.jpg` },
  { id: "photo-2", src: `${BASE}/photo-2.jpg`, thumb: `${BASE}/thumb-photo-2.jpg` },
  { id: "photo-3", src: `${BASE}/photo-3.jpg`, thumb: `${BASE}/thumb-photo-3.jpg` },
  { id: "photo-4", src: `${BASE}/photo-4.jpg`, thumb: `${BASE}/thumb-photo-4.jpg` },
  { id: "photo-5", src: `${BASE}/photo-5.jpg`, thumb: `${BASE}/thumb-photo-5.jpg` },
  { id: "storm", src: `${BASE}/storm.jpg`, thumb: `${BASE}/thumb-storm.jpg` },
  { id: "dunes", src: `${BASE}/dunes.jpg`, thumb: `${BASE}/thumb-dunes.jpg` },
  { id: "dunes-2", src: `${BASE}/dunes-2.jpg`, thumb: `${BASE}/thumb-dunes-2.jpg` },
  { id: "alessandro-russo", src: `${BASE}/alessandro-russo.jpg`, thumb: `${BASE}/thumb-alessandro-russo.jpg` },
  { id: "andy-kennedy", src: `${BASE}/andy-kennedy.jpg`, thumb: `${BASE}/thumb-andy-kennedy.jpg` },
  { id: "f-cary-snyder", src: `${BASE}/f-cary-snyder.jpg`, thumb: `${BASE}/thumb-f-cary-snyder.jpg` },
  { id: "fernando-jorge", src: `${BASE}/fernando-jorge.jpg`, thumb: `${BASE}/thumb-fernando-jorge.jpg` },
  { id: "jeremy-thomas", src: `${BASE}/jeremy-thomas.jpg`, thumb: `${BASE}/thumb-jeremy-thomas.jpg` },
  { id: "jonatan-pie", src: `${BASE}/jonatan-pie.jpg`, thumb: `${BASE}/thumb-jonatan-pie.jpg` },
  { id: "leo", src: `${BASE}/leo.jpg`, thumb: `${BASE}/thumb-leo.jpg` },
  { id: "leo-visions", src: `${BASE}/leo-visions.jpg`, thumb: `${BASE}/thumb-leo-visions.jpg` },
  { id: "leon-rohrwild", src: `${BASE}/leon-rohrwild.jpg`, thumb: `${BASE}/thumb-leon-rohrwild.jpg` },
  { id: "maahid-photos", src: `${BASE}/maahid-photos.jpg`, thumb: `${BASE}/thumb-maahid-photos.jpg` },
  { id: "manifest-stefany", src: `${BASE}/manifest-stefany.jpg`, thumb: `${BASE}/thumb-manifest-stefany.jpg` },
  { id: "marissa-rodriguez", src: `${BASE}/marissa-rodriguez.jpg`, thumb: `${BASE}/thumb-marissa-rodriguez.jpg` },
  { id: "mark-basarab", src: `${BASE}/mark-basarab.jpg`, thumb: `${BASE}/thumb-mark-basarab.jpg` },
  { id: "nasa-1", src: `${BASE}/nasa-1.jpg`, thumb: `${BASE}/thumb-nasa-1.jpg` },
  { id: "nasa-2", src: `${BASE}/nasa-2.jpg`, thumb: `${BASE}/thumb-nasa-2.jpg` },
  { id: "raychan", src: `${BASE}/raychan.jpg`, thumb: `${BASE}/thumb-raychan.jpg` },
  { id: "ryan-hutton", src: `${BASE}/ryan-hutton.jpg`, thumb: `${BASE}/thumb-ryan-hutton.jpg` },
  { id: "seelean", src: `${BASE}/seelean.jpg`, thumb: `${BASE}/thumb-seelean.jpg` },
  { id: "shot-by-cerqueira", src: `${BASE}/shot-by-cerqueira.jpg`, thumb: `${BASE}/thumb-shot-by-cerqueira.jpg` },
  { id: "silas-baisch", src: `${BASE}/silas-baisch.jpg`, thumb: `${BASE}/thumb-silas-baisch.jpg` },
  { id: "tom-barrett", src: `${BASE}/tom-barrett.jpg`, thumb: `${BASE}/thumb-tom-barrett.jpg` },
  { id: "trevor-mckinnon", src: `${BASE}/trevor-mckinnon.jpg`, thumb: `${BASE}/thumb-trevor-mckinnon.jpg` },
  { id: "abby-santurbane", src: `${BASE}/abby-santurbane.jpg`, thumb: `${BASE}/thumb-abby-santurbane.jpg` },
  {
    id: "aleksandra-khaprenko",
    src: `${BASE}/aleksandra-khaprenko.jpg`,
    thumb: `${BASE}/thumb-aleksandra-khaprenko.jpg`,
  },
  { id: "artem-kniaz", src: `${BASE}/artem-kniaz.jpg`, thumb: `${BASE}/thumb-artem-kniaz.jpg` },
  { id: "ashkan-forouzani", src: `${BASE}/ashkan-forouzani.jpg`, thumb: `${BASE}/thumb-ashkan-forouzani.jpg` },
  { id: "bernard-hermant", src: `${BASE}/bernard-hermant.jpg`, thumb: `${BASE}/thumb-bernard-hermant.jpg` },
  { id: "daniil-silantev", src: `${BASE}/daniil-silantev.jpg`, thumb: `${BASE}/thumb-daniil-silantev.jpg` },
  {
    id: "daniele-levis-pelusi",
    src: `${BASE}/daniele-levis-pelusi.jpg`,
    thumb: `${BASE}/thumb-daniele-levis-pelusi.jpg`,
  },
  { id: "decry-yae", src: `${BASE}/decry-yae.jpg`, thumb: `${BASE}/thumb-decry-yae.jpg` },
  { id: "digital-reach", src: `${BASE}/digital-reach.jpg`, thumb: `${BASE}/thumb-digital-reach.jpg` },
  { id: "gareth-david", src: `${BASE}/gareth-david.jpg`, thumb: `${BASE}/thumb-gareth-david.jpg` },
  { id: "jakob-braun", src: `${BASE}/jakob-braun.jpg`, thumb: `${BASE}/thumb-jakob-braun.jpg` },
  { id: "jkalina", src: `${BASE}/jkalina.jpg`, thumb: `${BASE}/thumb-jkalina.jpg` },
  { id: "jr-korpa", src: `${BASE}/jr-korpa.jpg`, thumb: `${BASE}/thumb-jr-korpa.jpg` },
  { id: "jude-infantini", src: `${BASE}/jude-infantini.jpg`, thumb: `${BASE}/thumb-jude-infantini.jpg` },
  { id: "nathan-dumlao", src: `${BASE}/nathan-dumlao.jpg`, thumb: `${BASE}/thumb-nathan-dumlao.jpg` },
  { id: "osman-rana", src: `${BASE}/osman-rana.jpg`, thumb: `${BASE}/thumb-osman-rana.jpg` },
  { id: "peter-aschoff", src: `${BASE}/peter-aschoff.jpg`, thumb: `${BASE}/thumb-peter-aschoff.jpg` },
  { id: "scott-rodgerson", src: `${BASE}/scott-rodgerson.jpg`, thumb: `${BASE}/thumb-scott-rodgerson.jpg` },
  { id: "sergey-pesterev", src: `${BASE}/sergey-pesterev.jpg`, thumb: `${BASE}/thumb-sergey-pesterev.jpg` },
  { id: "sumner-mahaffey", src: `${BASE}/sumner-mahaffey.jpg`, thumb: `${BASE}/thumb-sumner-mahaffey.jpg` },
  { id: "sydney-rae", src: `${BASE}/sydney-rae.jpg`, thumb: `${BASE}/thumb-sydney-rae.jpg` },
] as const satisfies readonly Wallpaper[]

export type WallpaperID = (typeof WALLPAPERS)[number]["id"]

export const WALLPAPER_DEFAULT: WallpaperID = "orchestra"
export const WALLPAPER_DIM_MAX = 0.8

export function wallpaperSrc(id: string) {
  return WALLPAPERS.find((item) => item.id === id)?.src
}
