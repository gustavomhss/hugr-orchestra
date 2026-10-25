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

const run = Spec.make("run", {
  description: "Run Orchestra with a message",
  params: {
    message: Argument.string("message").pipe(Argument.withDescription("message to send"), Argument.variadic({ min: 0 })),
    command: Flag.string("command").pipe(Flag.withDescription("the command to run, use message for args"), Flag.optional),
    continue: Flag.boolean("continue").pipe(Flag.withAlias("c"), Flag.withDefault(false), Flag.withDescription("continue the last session")),
    session: Flag.string("session").pipe(Flag.withAlias("s"), Flag.withDescription("session id to continue"), Flag.optional),
    fork: Flag.boolean("fork").pipe(
      Flag.withDefault(false),
      Flag.withDescription("fork the session before continuing (requires --continue or --session)"),
    ),
    model: Flag.string("model").pipe(
      Flag.withAlias("m"),
      Flag.withDescription("model to use in the format of provider/model"),
      Flag.optional,
    ),
    agent: Flag.string("agent").pipe(Flag.withDescription("agent to use"), Flag.optional),
    format: Flag.choice("format", ["default", "json"]).pipe(
      Flag.withDefault("default"),
      Flag.withDescription("default (formatted) or json (raw JSON events)"),
    ),
    file: Flag.string("file").pipe(Flag.withAlias("f"), Flag.withDescription("file(s) to attach to message"), Flag.atMost(100)),
    title: Flag.string("title").pipe(
      Flag.withDescription("title for the session (an empty value uses the truncated prompt)"),
      Flag.optional,
    ),
    attach: Flag.string("attach").pipe(
      Flag.withDescription("attach to a running Orchestra server (e.g., http://localhost:4096)"),
      Flag.optional,
    ),
    password: Flag.string("password").pipe(
      Flag.withAlias("p"),
      Flag.withDescription("basic auth password (defaults to ORCHESTRA_SERVER_PASSWORD)"),
      Flag.optional,
    ),
    username: Flag.string("username").pipe(
      Flag.withAlias("u"),
      Flag.withDescription("basic auth username (defaults to ORCHESTRA_SERVER_USERNAME or 'orchestra')"),
      Flag.optional,
    ),
    dir: Flag.string("dir").pipe(
      Flag.withDescription("directory to run in, path on remote server if attaching"),
      Flag.optional,
    ),
    variant: Flag.string("variant").pipe(
      Flag.withDescription("model variant (provider-specific reasoning effort, e.g., high, max, minimal)"),
      Flag.optional,
    ),
    thinking: Flag.boolean("thinking").pipe(Flag.withDefault(false), Flag.withDescription("show thinking blocks")),
    auto: Flag.boolean("auto").pipe(
      Flag.withDefault(false),
      Flag.withDescription("auto-approve permissions that are not explicitly denied (dangerous!)"),
    ),
  },
})

const attach = Spec.make("attach", {
  description: "Attach to a running Orchestra server",
  params: {
    url: Argument.string("url").pipe(Argument.withDescription("http://localhost:4096")),
    dir: Flag.string("dir").pipe(Flag.withDescription("directory to run in"), Flag.optional),
    continue: Flag.boolean("continue").pipe(Flag.withAlias("c"), Flag.withDefault(false), Flag.withDescription("continue the last session")),
    session: Flag.string("session").pipe(Flag.withAlias("s"), Flag.withDescription("session id to continue"), Flag.optional),
    fork: Flag.boolean("fork").pipe(
      Flag.withDefault(false),
      Flag.withDescription("fork the session when continuing (use with --continue or --session)"),
    ),
    password: Flag.string("password").pipe(
      Flag.withAlias("p"),
      Flag.withDescription("basic auth password (defaults to ORCHESTRA_SERVER_PASSWORD)"),
      Flag.optional,
    ),
    username: Flag.string("username").pipe(
      Flag.withAlias("u"),
      Flag.withDescription("basic auth username (defaults to ORCHESTRA_SERVER_USERNAME or 'orchestra')"),
      Flag.optional,
    ),
  },
})

const providers = Spec.make("providers", {
  description: "Manage AI providers and credentials",
  aliases: ["auth"],
  commands: [
    Spec.make("list", { description: "List providers and credentials", aliases: ["ls"] }),
    Spec.make("login", {
      description: "Log in to a provider",
      params: {
        provider: Flag.string("provider").pipe(
          Flag.withAlias("p"),
          Flag.withDescription("provider id or name to log in to (skips provider selection)"),
          Flag.optional,
        ),
        method: Flag.string("method").pipe(
          Flag.withAlias("m"),
          Flag.withDescription("login method label (skips method selection)"),
          Flag.optional,
        ),
        label: Flag.string("label").pipe(Flag.withDescription("label for the stored credential"), Flag.optional),
      },
    }),
    Spec.make("logout", {
      description: "Log out from a configured provider",
      params: { provider: Argument.string("provider id or name to log out from").pipe(Argument.optional) },
    }),
  ],
})

const mcpName = (description: string) => Argument.string(description).pipe(Argument.optional)

const mcp = Spec.make("mcp", {
  description: "Manage MCP (Model Context Protocol) servers",
  commands: [
    Spec.make("list", { description: "List MCP servers and their status", aliases: ["ls"] }),
    Spec.make("add", {
      description: "Add an MCP server",
      params: {
        name: mcpName("name of the MCP server"),
        url: Flag.string("url").pipe(Flag.withDescription("URL for a remote MCP server"), Flag.optional),
        env: Flag.string("env").pipe(
          Flag.withDescription("environment variable for a local MCP server (KEY=VALUE)"),
          Flag.atMost(100),
        ),
        header: Flag.string("header").pipe(
          Flag.withDescription("HTTP header for a remote MCP server (KEY=VALUE)"),
          Flag.atMost(100),
        ),
        command: Argument.string("command").pipe(
          Argument.withDescription("command for a local MCP server, after --"),
          Argument.variadic({ min: 0 }),
        ),
      },
    }),
    Spec.make("auth", {
      description: "Authenticate with an OAuth-enabled MCP server",
      params: { name: mcpName("name of the MCP server") },
      commands: [Spec.make("list", { description: "List MCP servers and their auth status", aliases: ["ls"] })],
    }),
    Spec.make("logout", {
      description: "Remove OAuth credentials for an MCP server",
      params: { name: mcpName("name of the MCP server") },
    }),
  ],
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
    run,
    attach,
    providers,
    mcp,
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
