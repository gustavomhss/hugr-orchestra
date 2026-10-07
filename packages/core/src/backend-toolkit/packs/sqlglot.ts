import type { Pack } from "../manifest"

// sqlglot is pure Python with no runtime dependencies, so one py3-none-any wheel (PyPI's sha256, checked against a
// download when pinning) installs on every target.
const VERSION = "30.21.0"

export default {
  id: "sqlglot",
  version: VERSION,
  license: "MIT",
  upstream: "tobymao/sqlglot",
  runtime: "python",
  install: {
    kind: "pip",
    requirements: `sqlglot==${VERSION} --hash=sha256:816d1a4815b7562b3976efcc0b561c928a743f976efd0fb8ad6db7a5b96c069e\n`,
  },
  launch: ["-m", "sqlglot"],
  // PYTHONSAFEPATH keeps `-m` from putting the working directory first on sys.path, where a project package could
  // shadow the pinned one; PYTHONNOUSERSITE does the same for the user's site-packages.
  env: { PYTHONPATH: "{install}", PYTHONSAFEPATH: "1", PYTHONNOUSERSITE: "1" },
  fit: {
    role: "check",
    input: "the Spark or other-dialect SQL the change wrote",
    skills: ["backend-data", "backend-check"],
  },
} as const satisfies Pack
