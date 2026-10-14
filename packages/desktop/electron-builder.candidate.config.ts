import type { Configuration } from "electron-builder"
import base from "./electron-builder.config"

const resources = base.extraResources ?? []
const unpack = base.asarUnpack ?? []

export default {
  ...base,
  appId: "ai.hugr.orchestra.lean.candidate",
  productName: "HuGR Lean Candidate",
  directories: { ...base.directories, output: "dist-candidate" },
  extraMetadata: {
    ...base.extraMetadata,
    name: "hugr-orchestra-lean-candidate",
    desktopName: "ai.hugr.orchestra.lean.candidate.desktop",
  },
  extraResources: [
    ...(Array.isArray(resources) ? resources : [resources]),
    { from: "../orchestra/dist/node/licenses", to: "licenses" },
  ],
  asarUnpack: [
    ...(Array.isArray(unpack) ? unpack : [unpack]),
    "node_modules/@lydell/node-pty-darwin-x64/**/*",
  ],
  protocols: [],
  publish: null,
  forceCodeSigning: false,
  mac: { ...base.mac, identity: null, notarize: false, hardenedRuntime: false },
  dmg: { ...base.dmg, sign: false },
} satisfies Configuration
