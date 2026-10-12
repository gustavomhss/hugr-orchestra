import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import { fileURLToPath } from "node:url"

const context = fileURLToPath(new URL("./directory-context.fixture.ts", import.meta.url))
export default defineConfig({
  plugins: [solid()],
  optimizeDeps: { entries: ["e2e/regression/directory-recovery.fixture.html"] },
  build: { rollupOptions: { input: fileURLToPath(new URL("./directory-recovery.fixture.html", import.meta.url)) } },
  resolve: { alias: [
    { find: "@/context/global", replacement: context },
    { find: "@/context/language", replacement: context },
    { find: "@orchestra/ui/context/dialog", replacement: context },
    { find: "@", replacement: fileURLToPath(new URL("../../src", import.meta.url)) },
  ] },
})
