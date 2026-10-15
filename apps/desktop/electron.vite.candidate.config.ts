import { defineConfig } from "electron-vite"
import base from "./electron.vite.config"

export default defineConfig({
  ...base,
  main: {
    ...base.main,
    define: {
      ...base.main?.define,
      "import.meta.env.ORCHESTRA_LEAN_CANDIDATE": JSON.stringify("1"),
    },
  },
})
