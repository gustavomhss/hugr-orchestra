import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"

// Exercise the real picker and application CSS without booting unrelated session/provider contexts.
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  optimizeDeps: { entries: ["e2e/orchestra/agent-picker.fixture.html"] },
  build: {
    target: "esnext",
    outDir: "e2e/test-results/agent-picker-dist",
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./agent-picker.fixture.html", import.meta.url)) },
  },
})
