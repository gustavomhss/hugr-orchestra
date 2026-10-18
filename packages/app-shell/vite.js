import { readFileSync } from "node:fs"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))
const background = fileURLToPath(new URL("./src/orchestra/background.css", import.meta.url))
// Generated first-paint rules of every Orchestra palette: the preload reads the selected palette's scheme from them.
const palettes = fileURLToPath(new URL("./src/orchestra/palette/generated/first-paint.css", import.meta.url))

const channel = (() => {
  const raw = process.env.ORCHESTRA_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.ORCHESTRA_CHANNEL === "latest") return "prod"
  return "dev"
})()

/**
 * @type {import("vite").PluginOption}
 */
export default [
  {
    name: "orchestra-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        define: {
          "import.meta.env.VITE_ORCHESTRA_CHANNEL": JSON.stringify(channel),
        },
        worker: {
          format: "es",
        },
        optimizeDeps: {
          // The dep scanner does not follow `?worker&url` imports, so the markdown worker's
          // dependencies were only discovered when the first message rendered. Vite then
          // re-optimized and force-reloaded the open page mid-session (and mid-e2e-test).
          // Vite resolves each entry from the dev root. apps/web does not declare @orchestra/ui and the isolated
          // install links only declared dependencies, so the chain starts at @orchestra/app, which the web and
          // desktop roots both declare. A bare `@orchestra/ui > dep` failed to resolve ("Failed to resolve
          // dependency" in the dev server log) and left the reload in place.
          include: ["@shikijs/stream", "katex", "marked", "marked-shiki", "remend"].map(
            (dependency) => `@orchestra/app > @orchestra/ui > ${dependency}`,
          ),
        },
      }
    },
  },
  {
    name: "orchestra-desktop:theme-preload",
    transformIndexHtml(html) {
      return html.replace(
        /<script id="oc-theme-preload-script" src="(?:\/|\.\/)oc-theme-preload\.js"><\/script>/,
        `<style id="oc-orchestra-background">${readFileSync(background, "utf8")}</style><style id="oc-orchestra-palettes">${readFileSync(palettes, "utf8")}</style><script id="oc-theme-preload-script">${readFileSync(theme, "utf8")}</script>`,
      )
    },
  },
  tailwindcss(),
  solidPlugin(),
]
