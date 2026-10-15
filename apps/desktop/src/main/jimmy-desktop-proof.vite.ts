import { defineConfig, type UserConfig } from "electron-vite"
import production from "../../electron.vite.config"

// Use the production consumer plugins, externals, shim and original sidecar entry.
// Only the windowless main harness and a runtime identity observation are added.
const config = production as UserConfig
if (!config.main) throw new Error("Desktop production main build configuration unavailable")
export default defineConfig({
  main: {
    ...config.main,
    build: {
      ...config.main.build,
      rollupOptions: {
        ...config.main.build?.rollupOptions,
        input: { "jimmy-desktop-proof": "src/main/jimmy-desktop-proof.fixture.ts", sidecar: "src/main/sidecar.ts" },
      },
    },
    plugins: [
      ...(config.main.plugins ?? []),
      {
        name: "jimmy:sidecar-identity-observer",
        transform(code, id) {
          if (!id.endsWith("/src/main/sidecar.ts")) return
          return `${code}\nconsole.log('JIMMY_NODE_IDENTITY=' + JSON.stringify({ pid: process.pid, ppid: process.ppid, execPath: process.execPath, entry: import.meta.url, argv: process.argv, versions: process.versions, type: process.type, arch: process.arch, platform: process.platform, db: process.env.ORCHESTRA_DB }));`
        },
      },
    ],
  },
})
