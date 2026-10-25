import { Argument, Flag } from "effect/unstable/cli"
import { Spec } from "../framework/spec"

const session = Spec.make("session", {
  description: "Manage sessions",
  commands: [
    Spec.make("list", {
      description: "List sessions",
      params: {
        limit: Flag.integer("limit").pipe(
          Flag.withAlias("n"),
          Flag.withDefault(50),
          Flag.withDescription("Limit to N most recent sessions"),
        ),
        format: Flag.choice("format", ["table", "json"]).pipe(Flag.withDefault("table")),
      },
    }),
    Spec.make("delete", {
      description: "Delete a session",
      params: { sessionID: Argument.string("session ID to delete") },
    }),
  ],
})

const models = Spec.make("models", {
  description: "List available models from the catalog",
  params: {
    provider: Argument.string("provider ID to filter models by").pipe(Argument.optional),
    json: Flag.boolean("json").pipe(Flag.withDefault(false), Flag.withDescription("Emit raw model records as JSON")),
  },
})

const upgrade = Spec.make("upgrade", {
  description: "Upgrade Orchestra to the latest or a specific version",
  params: {
    target: Argument.string("version to upgrade to, e.g. 1.0.1 or v1.0.1").pipe(Argument.optional),
    method: Flag.choice("method", ["npm", "github"])
      .pipe(Flag.withAlias("m"), Flag.withDefault("npm"), Flag.withDescription("Installation channel to use")),
  },
})

const uninstall = Spec.make("uninstall", {
  description: "Uninstall Orchestra and remove related files",
  params: {
    "keep-config": Flag.boolean("keep-config").pipe(Flag.withAlias("c"), Flag.withDefault(false)),
    "keep-data": Flag.boolean("keep-data").pipe(Flag.withAlias("d"), Flag.withDefault(false)),
    "dry-run": Flag.boolean("dry-run").pipe(Flag.withDefault(false), Flag.withDescription("Show what would be removed without removing")),
    force: Flag.boolean("force").pipe(Flag.withAlias("f"), Flag.withDefault(false), Flag.withDescription("Skip confirmation prompts")),
  },
})

const pr = Spec.make("pr", {
  description: "Check out a GitHub PR branch against the current repository",
  params: {
    number: Argument.integer("PR number to checkout").pipe(Argument.withDescription("PR number to checkout")),
  },
})

const db = Spec.make("db", {
  description: "Database tools",
  commands: [
    Spec.make("query", {
      description: "Run an SQL query against the local database",
      params: { sql: Argument.string("SQL query to execute").pipe(Argument.variadic({ min: 1 })) },
    }),
    Spec.make("path", { description: "Print the database path" }),
    Spec.make("compact", {
      description:
        "Delete duplicate snapshot events from the event log (local use only; incompatible with experimental workspace sync)",
    }),
  ],
})

const transcriptExport = Spec.make("export", {
  description: "Export a session transcript as JSON",
  params: { sessionID: Argument.string("session ID to export").pipe(Argument.optional) },
})

const transcriptImport = Spec.make("import", {
  description: "Import a session transcript from a JSON file",
  params: { file: Argument.string("path to the JSON file") },
})

declare const ORCHESTRA_CLI_NAME: string | undefined

export const Commands = Spec.make(typeof ORCHESTRA_CLI_NAME === "string" ? ORCHESTRA_CLI_NAME : "orchestra", {
  description: "Orchestra 2.0 preview command line interface",
  commands: [
    Spec.make("api", {
      description: "Make a request to the running server",
      params: {
        request: Argument.string("operation | method path").pipe(
          Argument.withDescription("OpenAPI operation ID, or an HTTP method followed by a path"),
          Argument.variadic({ min: 1, max: 2 }),
        ),
        data: Flag.string("data").pipe(Flag.withAlias("d"), Flag.withDescription("Request body"), Flag.optional),
        header: Flag.string("header").pipe(
          Flag.withAlias("H"),
          Flag.withDescription("Request header in name:value form"),
          Flag.atMost(100),
        ),
        param: Flag.keyValuePair("param").pipe(Flag.withDescription("OpenAPI path or query parameter"), Flag.optional),
      },
    }),
    Spec.make("debug", {
      description: "Debugging and troubleshooting tools",
      commands: [
        Spec.make("agents", { description: "List all agents" }),
        Spec.make("symbols", {
          description: "Extract a file's top-level symbols with Maestro's native parser",
          params: { file: Argument.string("file") },
        }),
        Spec.make("omni", {
          description: "show the process spawner in use (omni or legacy) and run a test process tree through omni",
          params: {
            hold: Flag.boolean("hold").pipe(
              Flag.withDefault(false),
              Flag.withDescription(
                "start the nonce tree, print `holding <nonce> pid=<this process>` and keep it alive until killed",
              ),
            ),
          },
        }),
      ],
    }),
    session,
    models,
    upgrade,
    uninstall,
    pr,
    db,
    transcriptExport,
    transcriptImport,
    Spec.make("migrate", { description: "Migrate v1 data to v2" }),
    Spec.make("service", {
      description: "Manage the background server",
      commands: [
        Spec.make("start", { description: "Start the background server" }),
        Spec.make("restart", { description: "Restart the background server" }),
        Spec.make("status", { description: "Show background server status" }),
        Spec.make("stop", { description: "Stop the background server" }),
        Spec.make("password", {
          description: "Get or set the server password",
          params: { value: Argument.string("value").pipe(Argument.optional) },
        }),
      ],
    }),
    Spec.make("serve", {
      description: "Start the v2 API server",
      params: {
        hostname: Flag.string("hostname").pipe(Flag.withDefault("127.0.0.1")),
        port: Flag.integer("port").pipe(Flag.optional),
        register: Flag.boolean("register").pipe(Flag.withDefault(false)),
      },
    }),
  ],
})
