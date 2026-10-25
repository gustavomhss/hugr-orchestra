import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { RGBA, type BoxRenderable } from "@opentui/core"
import { isTaskTool } from "@orchestra/core/util/task-tool"
import { useSync } from "../../context/sync"
import { useLocal } from "../../context/local"
import { createSyntaxStyleMemo, generateSubtleSyntax, selectedForeground, useTheme } from "../../context/theme"
import { reasoningSummary } from "../../context/thinking"
import { useCommandShortcut } from "../../keymap"
import { agentTitle } from "../../util/agent"
import { Locale } from "../../util/locale"
import { name } from "../../util/model"
import { isPrompt, toolMetadata, tools } from "../../util/session-message"
import { SplitBorder } from "../../ui/border"
import { Spinner } from "../../component/spinner"
import type {
  SessionMessage,
  SessionMessageAssistant,
  SessionMessageAssistantReasoning,
  SessionMessageAssistantText,
  SessionMessageCompaction,
  SessionMessageSynthetic,
  SessionMessageUser,
} from "../../types"
import { promptText } from "./prompt-draft"
import { ToolCall } from "./tool"
import { alwaysSeparate } from "./tool-frame"
import { use } from "./view-context"

export function UserMessage(props: {
  message: SessionMessageUser | SessionMessageSynthetic
  agent: string
  onMouseUp: () => void
  index: number
  pending?: number
}) {
  const ctx = use()
  const local = useLocal()
  const text = createMemo(() => promptText(props.message))
  const files = createMemo(() => props.message.files ?? [])
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const queued = createMemo(() => props.pending !== undefined && props.index > props.pending)
  const color = createMemo(() => local.agent.color(props.agent))
  const queuedFg = createMemo(() => selectedForeground(theme, color()))
  const metadataVisible = createMemo(() => queued() || ctx.showTimestamps())

  return (
    <Show when={text()}>
      <box
        id={props.message.id}
        ref={(el: BoxRenderable) => alwaysSeparate.add(el)}
        border={["left"]}
        borderColor={color()}
        customBorderChars={SplitBorder.customBorderChars}
        marginTop={props.index === 0 ? 0 : 1}
      >
        <box
          onMouseOver={() => {
            setHover(true)
          }}
          onMouseOut={() => {
            setHover(false)
          }}
          onMouseUp={props.onMouseUp}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          backgroundColor={hover() ? theme.backgroundElement : theme.backgroundPanel}
          flexShrink={0}
        >
          <text fg={theme.text}>{text()}</text>
          <Show when={files().length}>
            <box flexDirection="row" paddingBottom={metadataVisible() ? 1 : 0} paddingTop={1} gap={1} flexWrap="wrap">
              <For each={files()}>
                {(file) => {
                  const directory = file.mime === "application/x-directory"
                  return (
                    <text fg={theme.text}>
                      <span style={{ bg: theme.secondary, fg: theme.background }}>
                        {directory ? " Directory " : " File "}
                      </span>
                      <span style={{ bg: theme.backgroundElement, fg: theme.textMuted }}> {file.name} </span>
                    </text>
                  )
                }}
              </For>
            </box>
          </Show>
          <Show
            when={queued()}
            fallback={
              <Show when={ctx.showTimestamps()}>
                <text fg={theme.textMuted}>
                  <span style={{ fg: theme.textMuted }}>{Locale.todayTimeOrDateTime(props.message.time.created)}</span>
                </text>
              </Show>
            }
          >
            <text fg={theme.textMuted}>
              <span style={{ bg: color(), fg: queuedFg(), bold: true }}> QUEUED </span>
            </text>
          </Show>
        </box>
      </box>
    </Show>
  )
}

export function CompactionMessage(props: { message: SessionMessageCompaction }) {
  const { theme } = useTheme()
  return (
    <>
      <box marginTop={1} border={["top"]} title=" Compaction " titleAlignment="center" borderColor={theme.borderActive} />
      <AssistantText part={{ type: "text", id: `${props.message.id}-summary`, text: props.message.summary }} />
    </>
  )
}

export function AssistantTurn(props: { message: SessionMessageAssistant; last: boolean }) {
  const ctx = use()
  const local = useLocal()
  const { theme } = useTheme()
  const sync = useSync()
  const messages = createMemo(() => sync.data.message[ctx.sessionID] ?? [])
  const model = createMemo(() => name(ctx.providers(), props.message.model.providerID, props.message.model.id))
  const tasks = createMemo(() => tools(props.message).filter((tool) => isTaskTool(tool.name)))

  const final = createMemo(() => {
    return props.message.finish && !["tool-calls", "unknown"].includes(props.message.finish)
  })

  // V2 messages carry no parent link, so the turn starts at the closest earlier prompt.
  const duration = createMemo(() => {
    if (!final()) return 0
    if (!props.message.time.completed) return 0
    const index = messages().findIndex((x) => x.id === props.message.id)
    const prompt = messages().slice(0, Math.max(0, index)).findLast(isPrompt)
    if (!prompt) return 0
    return props.message.time.completed - prompt.time.created
  })

  const childShortcut = useCommandShortcut("session.child.first")
  const backgroundShortcut = useCommandShortcut("session.background")

  return (
    <>
      <For each={props.message.content}>
        {(part) => (
          <Switch>
            <Match when={part.type === "text" && part}>{(text) => <AssistantText part={text()} />}</Match>
            <Match when={part.type === "reasoning" && part}>
              {(reasoning) => <AssistantReasoning part={reasoning()} />}
            </Match>
            <Match when={part.type === "tool" && part}>{(tool) => <ToolCall part={tool()} />}</Match>
          </Switch>
        )}
      </For>
      <Show when={tasks().length}>
        <box paddingTop={1} paddingLeft={3}>
          <text fg={theme.text}>
            {childShortcut()}
            <span style={{ fg: theme.textMuted }}> view subagents</span>
            <Show
              when={
                sync.data.capabilities.experimentalBackgroundSubagents &&
                tasks().some((tool) => tool.state.status === "running" && toolMetadata(tool).background !== true)
              }
            >
              <span style={{ fg: theme.textMuted }}> · </span>
              {backgroundShortcut()}
              <span style={{ fg: theme.textMuted }}> background</span>
            </Show>
          </text>
        </box>
      </Show>
      <Show when={props.message.error}>
        {(error) => (
          <box
            ref={(el: BoxRenderable) => alwaysSeparate.add(el)}
            border={["left"]}
            paddingTop={1}
            paddingBottom={1}
            paddingLeft={2}
            marginTop={1}
            backgroundColor={theme.backgroundPanel}
            customBorderChars={SplitBorder.customBorderChars}
            borderColor={theme.error}
          >
            <text fg={theme.textMuted}>{error().message}</text>
          </box>
        )}
      </Show>
      <Show when={props.last || final()}>
        <box ref={(el: BoxRenderable) => alwaysSeparate.add(el)} paddingLeft={3}>
          <text marginTop={1}>
            <span style={{ fg: local.agent.color(props.message.agent) }}>▣ </span>{" "}
            <span style={{ fg: theme.text }}>{agentTitle(sync.data.agent, props.message.agent)}</span>
            <span style={{ fg: theme.textMuted }}> · {model()}</span>
            <Show when={duration()}>
              <span style={{ fg: theme.textMuted }}> · {Locale.duration(duration())}</span>
            </Show>
          </text>
        </box>
      </Show>
    </>
  )
}

/** The agent in effect when `message` was sent: the latest switch or assistant before it, else the first assistant. */
export function promptAgent(messages: SessionMessage[], message: SessionMessage) {
  const index = messages.indexOf(message)
  const before = messages
    .slice(0, Math.max(0, index))
    .findLast((x) => x.type === "agent-switched" || x.type === "assistant")
  if (before?.type === "agent-switched" || before?.type === "assistant") return before.agent
  const first = messages.find((x) => x.type === "assistant")
  return first?.type === "assistant" ? first.agent : ""
}

function AssistantReasoning(props: { part: SessionMessageAssistantReasoning }) {
  const { theme } = useTheme()
  const ctx = use()
  // Collapsed by default in hide mode: a single line throughout, so the
  // layout never shifts. Click to open the full markdown block, click to close.
  const [expanded, setExpanded] = createSignal(false)

  const content = createMemo(() => {
    // OpenRouter encrypts some reasoning blocks; drop the placeholder.
    return props.part.text.replace("[REDACTED]", "").trim()
  })
  const opaque = createMemo(() => !content() && Boolean(props.part.providerMetadata))
  // Reasoning is finalized when the server sets `time.completed`.
  // Flips independently of the parent message completing.
  const isDone = createMemo(() => props.part.time.completed !== undefined)
  const inMinimal = createMemo(() => ctx.thinkingMode() === "hide")
  const duration = createMemo(() => {
    const end = props.part.time.completed
    return end === undefined ? 0 : Math.max(0, end - props.part.time.created)
  })
  const summary = createMemo(() => reasoningSummary(content()))
  const syntax = createSyntaxStyleMemo(() => generateSubtleSyntax(theme))

  const toggle = () => {
    if (!inMinimal() || opaque()) return
    setExpanded((prev) => !prev)
  }

  return (
    <Show when={content() || opaque()}>
      <box
        ref={(el: BoxRenderable) => alwaysSeparate.add(el)}
        paddingLeft={3}
        marginTop={1}
        flexDirection="column"
        flexShrink={0}
      >
        <box onMouseUp={toggle}>
          <ReasoningHeader
            toggleable={inMinimal() && !opaque()}
            open={!inMinimal() || expanded()}
            done={isDone()}
            title={summary().title}
            duration={isDone() ? Locale.duration(duration()) : undefined}
            encrypted={opaque()}
          />
        </box>
        <Show when={!opaque() && (!inMinimal() || expanded()) && summary().body}>
          <box paddingLeft={inMinimal() ? 2 : 0} marginTop={1}>
            <code
              filetype="markdown"
              drawUnstyledText={false}
              streaming={true}
              syntaxStyle={syntax()}
              content={summary().body}
              conceal={ctx.conceal()}
              fg={theme.textMuted}
            />
          </box>
        </Show>
      </box>
    </Show>
  )
}

function ReasoningHeader(props: {
  toggleable: boolean
  open: boolean
  done: boolean
  title: string | null
  duration?: string
  encrypted?: boolean
}) {
  const { theme } = useTheme()
  const fg = () =>
    props.open
      ? RGBA.fromValues(theme.warning.r, theme.warning.g, theme.warning.b, theme.thinkingOpacity)
      : theme.warning
  const completed = () => {
    if (props.encrypted) return `Thought${props.duration ? ` · ${props.duration}` : ""}`
    const detail = [props.title, props.duration].filter(Boolean).join(" · ")
    return `${props.toggleable ? (props.open ? "- " : "+ ") : ""}Thought${detail ? `: ${detail}` : ""}`
  }

  return (
    <Switch>
      <Match when={!props.done}>
        <box flexDirection="row">
          <Spinner color={fg()}>{props.title ? "Thinking: " + props.title : "Thinking"}</Spinner>
        </box>
      </Match>
      <Match when={true}>
        <text fg={fg()} wrapMode="none">
          {completed()}
        </text>
      </Match>
    </Switch>
  )
}

function AssistantText(props: { part: SessionMessageAssistantText }) {
  const ctx = use()
  const { theme, syntax } = useTheme()
  return (
    <Show when={props.part.text.trim()}>
      <box ref={(el: BoxRenderable) => alwaysSeparate.add(el)} paddingLeft={3} marginTop={1} flexShrink={0}>
        <markdown
          syntaxStyle={syntax()}
          streaming={true}
          internalBlockMode="top-level"
          content={props.part.text.trim()}
          tableOptions={{ style: "grid" }}
          conceal={ctx.conceal()}
          fg={theme.markdownText}
          bg={theme.background}
        />
      </box>
    </Show>
  )
}

