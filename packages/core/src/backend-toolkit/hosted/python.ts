// placeholder: replaced by tk-python
import type { HostedEngine, Runtime } from "../manifest"

// placeholder: replaced by tk-python. Every pin below is fake and fails integrity on purpose.
const FAKE = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" as const
const pin = (executable: string) => ({
  artifact: { url: "https://placeholder.invalid/python.tar.gz", integrity: FAKE, format: "tar.gz" as const, entries: [] },
  executable,
})

export const PYTHON: Runtime = {
  id: "python",
  version: "0.0.0-placeholder",
  license: "placeholder",
  upstream: "placeholder/python",
  targets: {
    "darwin-arm64": pin("bin/python3"),
    "darwin-x64": pin("bin/python3"),
    "linux-arm64": pin("bin/python3"),
    "linux-x64": pin("bin/python3"),
    "win32-x64": pin("python.exe"),
  },
}

export const DATAMODEL_CODEGEN: HostedEngine = {
  id: "datamodel-codegen",
  version: "0.0.0-placeholder",
  license: "placeholder",
  upstream: "placeholder/datamodel-codegen",
  runtime: "python",
  install: { kind: "pip", requirements: "" },
  launch: ["-m", "datamodel_code_generator"],
}
