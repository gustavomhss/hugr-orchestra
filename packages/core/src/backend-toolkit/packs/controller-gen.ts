import type { Pack } from "../manifest"

const VERSION = "0.22.0"

export default {
  id: "controller-gen",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "kubernetes-sigs/controller-tools",
  // Pins are the GitHub release assets' sha256 digests in SRI form;
  // the darwin-x64 asset matched its digest and runs as a bare executable.
  targets: {
    "darwin-arm64": {
      artifact: {
        url: `https://github.com/kubernetes-sigs/controller-tools/releases/download/v${VERSION}/controller-gen-darwin-arm64`,
        integrity: "sha256-Xg18Fu2cwK6IfALr9SRKJzlJXJPuqnsgzN06uyClOEY=",
        format: "raw",
        entries: [{ from: "controller-gen-darwin-arm64", to: "controller-gen", executable: true }],
      },
      executable: "controller-gen",
    },
    "darwin-x64": {
      artifact: {
        url: `https://github.com/kubernetes-sigs/controller-tools/releases/download/v${VERSION}/controller-gen-darwin-amd64`,
        integrity: "sha256-+kxNAcrNxuIgm3G+rBbYfSs8ZBhmpd3rbY591ro4Hw8=",
        format: "raw",
        entries: [{ from: "controller-gen-darwin-amd64", to: "controller-gen", executable: true }],
      },
      executable: "controller-gen",
    },
    "linux-arm64": {
      artifact: {
        url: `https://github.com/kubernetes-sigs/controller-tools/releases/download/v${VERSION}/controller-gen-linux-arm64`,
        integrity: "sha256-xRUfMMOlHdyNciwYwmO0ldrplMokbp+omUsdTJXzJTo=",
        format: "raw",
        entries: [{ from: "controller-gen-linux-arm64", to: "controller-gen", executable: true }],
      },
      executable: "controller-gen",
    },
    "linux-x64": {
      artifact: {
        url: `https://github.com/kubernetes-sigs/controller-tools/releases/download/v${VERSION}/controller-gen-linux-amd64`,
        integrity: "sha256-p9Zx8ODaB6Z7OhYYpsq1A1Pf/qViXNLYqLPhi6y0l+Y=",
        format: "raw",
        entries: [{ from: "controller-gen-linux-amd64", to: "controller-gen", executable: true }],
      },
      executable: "controller-gen",
    },
    "win32-x64": {
      artifact: {
        url: `https://github.com/kubernetes-sigs/controller-tools/releases/download/v${VERSION}/controller-gen-windows-amd64.exe`,
        integrity: "sha256-fAUiqBNAMI7E6q7KRyUpmv0l1ap+w1GkbSEh/xQz7xU=",
        format: "raw",
        entries: [{ from: "controller-gen-windows-amd64.exe", to: "controller-gen.exe", executable: true }],
      },
      executable: "controller-gen.exe",
    },
  },
  fit: {
    role: "generator",
    input: "Go API types with kubebuilder markers the packet assigns",
    skills: ["backend-api"],
  },
} as const satisfies Pack
