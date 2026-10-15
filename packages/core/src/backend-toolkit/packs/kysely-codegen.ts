import type { Pack } from "../manifest"
import lock from "./kysely-codegen.package-lock.json"

// kysely-codegen loads its database driver as an optional peer and requires `typescript` without declaring it, so the
// pack pins the PostgreSQL and MySQL drivers and TypeScript alongside it (`kysely` comes in as its required peer).
// TypeScript stays on 6.x: 7.x is the native port without the JavaScript compiler API kysely-codegen calls.
// SQLite's better-sqlite3 is left out: it needs a native build, and the install runs no scripts.
const VERSION = "0.20.0"

export default {
  id: "kysely-codegen",
  version: VERSION,
  license: "MIT",
  upstream: "RobinBlomberg/kysely-codegen",
  runtime: "node",
  install: {
    kind: "npm",
    // The package.json text the lock was written from, in npm's own formatting.
    packageJson:
      JSON.stringify(
        {
          name: "backend-toolkit-kysely-codegen",
          private: true,
          dependencies: { "kysely-codegen": VERSION, mysql2: "3.24.5", pg: "8.23.1", typescript: "6.0.3" },
        },
        null,
        2,
      ) + "\n",
    lock: JSON.stringify(lock, null, 2) + "\n",
  },
  launch: ["{install}/node_modules/kysely-codegen/dist/cli/bin.js"],
  fit: {
    role: "generator",
    input: "a disposable PostgreSQL or MySQL database holding the schema",
    skills: ["backend-data"],
  },
} as const satisfies Pack
