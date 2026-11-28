import type { Pack } from "../manifest"
import type { TargetId } from "../target"
import { BackendToolkitNoticeSources } from "../notice-sources"
import sources from "./kubeconform.notices.json"

const VERSION = "0.8.0"

export default {
  id: "kubeconform",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "yannh/kubeconform",
  binaryIntegrity: {
    "darwin-arm64": "sha256-hYzrWEkVwlYmIJAZXtoleSmRSQUMXGqXiNCYUHaDIxM=",
    "darwin-x64": "sha256-ITj8UaCxXv6Cf0nB3tjrY9oEnVmGSudKk4RxX5q2+U0=",
    "linux-arm64": "sha256-fnexBLOuaWOJ+Rlxxg/VjHLx89whjxOd9nobBwlZwBI=",
    "linux-x64": "sha256-RXcis26Y1728kVJeWUlR711+o6KdotE7myii+4pQl7c=",
    "win32-x64": "sha256-ZCv46g1hSox10r0BLrYEKpBYn/hGxp8Ehjr6RGsw8sE=",
  },
  notices: BackendToolkitNoticeSources.from(sources),
  // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
  floor: {
    "darwin-arm64": { macos: "12.0" },
    "darwin-x64": { macos: "12.0" },
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  },
  // Pins are the GitHub release assets' sha256 digests in SRI form;
  // the darwin-x64 archive matched its digest and holds the executable at its root.
  targets: {
    "darwin-arm64": {
      artifact: {
        url: `https://github.com/yannh/kubeconform/releases/download/v${VERSION}/kubeconform-darwin-arm64.tar.gz`,
        integrity: "sha256-+E9N++v0prCyMDhfoGWjnqNeAmCMK1DQJdz2R3WmnWc=",
        format: "tar.gz",
        entries: [{ from: "kubeconform", to: "kubeconform", executable: true }],
      },
      executable: "kubeconform",
    },
    "darwin-x64": {
      artifact: {
        url: `https://github.com/yannh/kubeconform/releases/download/v${VERSION}/kubeconform-darwin-amd64.tar.gz`,
        integrity: "sha256-cdvIesnyQJmmK5NXDmWqBjErpqyK6mO3+G6dmZ7fWpI=",
        format: "tar.gz",
        entries: [{ from: "kubeconform", to: "kubeconform", executable: true }],
      },
      executable: "kubeconform",
    },
    "linux-arm64": {
      artifact: {
        url: `https://github.com/yannh/kubeconform/releases/download/v${VERSION}/kubeconform-linux-arm64.tar.gz`,
        integrity: "sha256-H1P8joElgZejXoYDBUFipa8d6MWvE3RscatoDZU07Yc=",
        format: "tar.gz",
        entries: [{ from: "kubeconform", to: "kubeconform", executable: true }],
      },
      executable: "kubeconform",
    },
    "linux-x64": {
      artifact: {
        url: `https://github.com/yannh/kubeconform/releases/download/v${VERSION}/kubeconform-linux-amd64.tar.gz`,
        integrity: "sha256-m8K/+/cfJhEoUz7a+RIVOUi3/yOPmlMa5tNEZuwoeIM=",
        format: "tar.gz",
        entries: [{ from: "kubeconform", to: "kubeconform", executable: true }],
      },
      executable: "kubeconform",
    },
    "win32-x64": {
      artifact: {
        url: `https://github.com/yannh/kubeconform/releases/download/v${VERSION}/kubeconform-windows-amd64.zip`,
        integrity: "sha256-4/VhArz09QsDSlZ+JIKhxTMHmZg93WVZUjECEa73PZM=",
        format: "zip",
        entries: [{ from: "kubeconform.exe", to: "kubeconform.exe", executable: true }],
      },
      executable: "kubeconform.exe",
    },
  },
  fit: {
    role: "check",
    input: "Kubernetes manifests the change wrote, with the schemas the packet supplies",
    skills: ["backend-check"],
  },
} as const satisfies Pack & { readonly binaryIntegrity: Readonly<Record<TargetId, `sha256-${string}`>> }
