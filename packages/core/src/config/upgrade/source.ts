export * as ConfigUpgradeSource from "./source"

// The older `orchestra.json` layout. Config files on disk may still use it, so loading reads it with this schema and
// ConfigUpgrade.migrate rewrites it into the current Config.Info shape.

import { Schema } from "effect"
import { ConfigMaestro } from "@orchestra/schema/config-maestro"
import { NonNegativeInt, PositiveInt, type DeepMutable } from "../../schema"
import { ConfigExperimental } from "../experimental"
import { ConfigReference } from "../reference"
import { ConfigRelay } from "../relay"
import { ConfigUpgradeAgent } from "./agent"
import { ConfigUpgradeAttachment } from "./attachment"
import { ConfigUpgradeCommand } from "./command"
import { ConfigUpgradeFormatter } from "./formatter"
import { ConfigUpgradeLSP } from "./lsp"
import { ConfigUpgradeMCP } from "./mcp"
import { ConfigUpgradePermission } from "./permission"
import { ConfigUpgradePlugin } from "./plugin"
import { ConfigUpgradeProvider } from "./provider"
import { ConfigUpgradeSkills } from "./skills"

export const Info = Schema.Struct({
  $schema: Schema.optional(Schema.String).annotate({
    description: "JSON schema reference for configuration validation",
  }),
  shell: Schema.optional(Schema.String).annotate({ description: "Default shell to use for terminal and bash tool" }),
  command: Schema.optional(Schema.Record(Schema.String, ConfigUpgradeCommand.Info)).annotate({
    description: "Command configuration",
  }),
  skills: Schema.optional(ConfigUpgradeSkills.Info).annotate({ description: "Additional skill folder paths" }),
  maestro: Schema.optional(ConfigMaestro.Info).annotate({
    description: "Project-bound static Atlas/Own context for governed Maestro work",
  }),
  references: Schema.optional(ConfigReference.Info).annotate({
    description: "Named git or local directory references",
  }),
  reference: Schema.optional(ConfigReference.Info).annotate({
    description: "@deprecated Use 'references' field instead. Named git or local directory references",
  }),
  watcher: Schema.optional(Schema.Struct({ ignore: Schema.optional(Schema.mutable(Schema.Array(Schema.String))) })),
  snapshot: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable or disable snapshot tracking. When false, filesystem snapshots are not recorded and undoing or reverting will not undo/redo file changes. Defaults to true.",
  }),
  plugin: Schema.optional(Schema.mutable(Schema.Array(ConfigUpgradePlugin.Spec))),
  autoupdate: Schema.optional(Schema.Union([Schema.Boolean, Schema.Literal("notify")])).annotate({
    description:
      "Automatically update to the latest version. Set to true to auto-update, false to disable, or 'notify' to show update notifications",
  }),
  disabled_providers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Disable providers that are loaded automatically",
  }),
  enabled_providers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "When set, ONLY these providers will be enabled. All other providers will be ignored",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: "Model to use in the format of provider/model, eg anthropic/claude-2",
  }),
  default_agent: Schema.optional(Schema.String).annotate({
    description:
      "Default agent to use when none is specified. Must be a primary agent. Falls back to 'maestro' if not set or if the specified agent is invalid.",
  }),
  username: Schema.optional(Schema.String).annotate({
    description: "Custom username to display in conversations instead of system username",
  }),
  mode: Schema.optional(Schema.Record(Schema.String, ConfigUpgradeAgent.Info)).annotate({
    description: "@deprecated Use `agent` field instead.",
  }),
  agent: Schema.optional(
    Schema.StructWithRest(
      Schema.Struct({
        maestro: Schema.optional(ConfigUpgradeAgent.Info),
        general: Schema.optional(ConfigUpgradeAgent.Info),
        explore: Schema.optional(ConfigUpgradeAgent.Info),
        title: Schema.optional(ConfigUpgradeAgent.Info),
        summary: Schema.optional(ConfigUpgradeAgent.Info),
        compaction: Schema.optional(ConfigUpgradeAgent.Info),
      }),
      [Schema.Record(Schema.String, ConfigUpgradeAgent.Info)],
    ),
  ).annotate({ description: "Agent configuration" }),
  provider: Schema.optional(Schema.Record(Schema.String, ConfigUpgradeProvider.Info)).annotate({
    description: "Custom provider configurations and model overrides",
  }),
  mcp: Schema.optional(
    Schema.Record(Schema.String, Schema.Union([ConfigUpgradeMCP.Info, Schema.Struct({ enabled: Schema.Boolean })])),
  ).annotate({ description: "MCP (Model Context Protocol) server configurations" }),
  formatter: Schema.optional(ConfigUpgradeFormatter.Info).annotate({
    description:
      "Enable or configure formatters. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides.",
  }),
  lsp: Schema.optional(ConfigUpgradeLSP.Info).annotate({
    description:
      "Enable or configure LSP servers. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides.",
  }),
  instructions: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Additional instruction files or patterns to include",
  }),
  permission: Schema.optional(ConfigUpgradePermission.Info),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  attachment: Schema.optional(ConfigUpgradeAttachment.Info).annotate({
    description: "Attachment processing configuration, including image size limits and resizing behavior",
  }),
  tool_output: Schema.optional(
    Schema.Struct({
      max_lines: Schema.optional(PositiveInt).annotate({
        description: "Maximum lines of tool output before it is truncated and saved to disk (default: 2000)",
      }),
      max_bytes: Schema.optional(PositiveInt).annotate({
        description: "Maximum bytes of tool output before it is truncated and saved to disk (default: 51200)",
      }),
      lean: Schema.optional(Schema.Struct({ enabled: Schema.optional(Schema.Boolean) })),
    }),
  ).annotate({
    description:
      "Thresholds for truncating tool output. When output exceeds either limit, the full text is written to the truncation directory and a preview is returned.",
  }),
  research: Schema.optional(
    Schema.Struct({
      limits: Schema.optional(Schema.Struct({
        indexer_bytes: Schema.optional(PositiveInt).annotate({ description: "Memory cap of one code indexer run in bytes (default and maximum: 2 GiB)" }),
        probe_bytes: Schema.optional(PositiveInt).annotate({ description: "Memory cap of one research probe in bytes (default and maximum: 1 GiB)" }),
        scratch_bytes: Schema.optional(PositiveInt).annotate({ description: "Scratch disk of one research probe in bytes (default and maximum: 2 GiB)" }),
        index_bytes: Schema.optional(PositiveInt).annotate({ description: "Disk budget of the code index cache in bytes (default and maximum: 4 GiB)" }),
      })),
    }),
  ).annotate({
    description: "Resource caps of the discovery seat's research toolkit. A configured value can only lower its built-in cap.",
  }),
  compaction: Schema.optional(
    Schema.Struct({
      auto: Schema.optional(Schema.Boolean).annotate({
        description: "Enable automatic compaction when context is full (default: true)",
      }),
      prune: Schema.optional(Schema.Boolean).annotate({
        description: "Enable pruning of old tool outputs (default: false)",
      }),
      tail_turns: Schema.optional(NonNegativeInt).annotate({
        description:
          "Maximum number of recent user turns, including their following assistant/tool responses, to keep verbatim during compaction. By default retention is limited only by the preserved token budget.",
      }),
      preserve_recent_tokens: Schema.optional(NonNegativeInt).annotate({
        description: "Maximum number of tokens from recent turns to preserve verbatim after compaction",
      }),
      reserved: Schema.optional(NonNegativeInt).annotate({
        description: "Token buffer for compaction. Leaves enough window to avoid overflow during compaction.",
      }),
    }),
  ),
  continuity: Schema.optional(
    Schema.Struct({
      enabled: Schema.optional(Schema.Boolean).annotate({
        description: "Keep long sessions under the context limit with background working memory (default: true)",
      }),
      trigger: Schema.optional(Schema.Finite).annotate({
        description:
          "Fraction of the model context window at which background maintenance runs, between 0 and 1 (default: 0.7)",
      }),
    }),
  ),
  relay: Schema.optional(ConfigRelay.Info).annotate({ description: "Relay workflow and hook engine settings" }),
  experimental: Schema.optional(
    Schema.Struct({
      disable_paste_summary: Schema.optional(Schema.Boolean),
      batch_tool: Schema.optional(Schema.Boolean).annotate({ description: "Enable the batch tool" }),
      openTelemetry: Schema.optional(Schema.Boolean).annotate({
        description: "Enable OpenTelemetry spans for AI SDK calls (using the 'experimental_telemetry' flag)",
      }),
      primary_tools: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
        description: "Tools that should only be available to primary agents.",
      }),
      continue_loop_on_deny: Schema.optional(Schema.Boolean).annotate({
        description: "Continue the agent loop when a tool call is denied",
      }),
      mcp_timeout: Schema.optional(PositiveInt).annotate({
        description: "Timeout in milliseconds for model context protocol (MCP) requests",
      }),
      policies: Schema.optional(Schema.mutable(Schema.Array(ConfigExperimental.Policy))).annotate({
        description: "Policy statements applied to supported resources, such as provider access",
      }),
    }),
  ),
}).annotate({ identifier: "Config" })

export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>
