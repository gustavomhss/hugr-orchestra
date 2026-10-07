import { readFileSync } from "node:fs"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))
const background = fileURLToPath(new URL("./src/orchestra/background.css", import.meta.url))

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
          // Anchored on @orchestra/ui so the same specs resolve from the app and desktop roots.
          include: ["@shikijs/stream", "katex", "marked", "marked-shiki", "remend"].map(
            (dependency) => `@orchestra/ui > ${dependency}`,
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
        `<style id="oc-orchestra-background">${readFileSync(background, "utf8")}</style><script id="oc-theme-preload-script">${readFileSync(theme, "utf8")}</script>`,
      )
    },
  },
  tailwindcss(),
  solidPlugin(),
]
