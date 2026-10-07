import type { Pack } from "../manifest"
import { WHEELS } from "./datamodel-codegen.wheels"

export default {
  id: "datamodel-codegen",
  version: "0.83.0",
  license: "MIT",
  upstream: "koxudaxi/datamodel-code-generator",
  runtime: "python",
  install: {
    kind: "pip",
    // One `name==version --hash=...` line per pin, with the sha256 of every wheel any target may pick.
    requirements:
      Object.entries(WHEELS)
        .map(([pin, wheels]) => [pin, ...Object.values(wheels).map((hex) => `--hash=sha256:${hex}`)].join(" "))
        .join("\n") + "\n",
  },
  launch: ["-m", "datamodel_code_generator"],
  // PYTHONSAFEPATH keeps `-m` from putting the working directory first on sys.path, where a project package could
  // shadow the pinned ones; PYTHONNOUSERSITE does the same for the user's site-packages.
  env: { PYTHONPATH: "{install}", PYTHONSAFEPATH: "1", PYTHONNOUSERSITE: "1" },
  fit: { role: "generator", input: "an OpenAPI document or JSON Schema", skills: ["backend-api"] },
} as const satisfies Pack
