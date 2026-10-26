import { createEffect, createSignal, For, type JSX, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { render } from "solid-js/web"
import type {
  LiveOverlayAnswer,
  LiveOverlayError,
  LiveOverlayHotkey,
  LiveOverlaySense,
  LiveOverlaySource,
  LiveOverlayState,
  LiveOverlayView,
} from "../../main/live-overlay-state"
import "./live.css"

// The live seat overlay. Main owns the state and pushes it whole; this window only draws it and reports clicks back.
// Its copy is English-only for now and stays out of the desktop i18n dictionaries, which are checked against every
// locale.
const copy = {
  label: "Live",
  listening: "Listening",
  answered: (seconds: string) => `Answered in ${seconds} s`,
  page: (index: number, total: number) => `${index} of ${total}`,
  ask: "Ask",
  look: "Look",
  move: "Move",
  captions: "Captions",
  suggestions: "Suggestions",
  protected: "Hidden from screen sharing",
  stop: "Stop meeting",
  copy: "Copy",
  placeholder: "Ask about this call…",
  quick: { say: "What should I say?", "follow-up": "Follow-up questions", "fact-check": "Fact-check", recap: "Recap so far" },
  sources: { heard: "Heard in the meeting", screen: "On screen", memory: "From memory" },
  tracks: { me: "Me", them: "Them" },
  status: {
    micOff: "Mic off · them only",
    audioOff: "Call audio off · you only",
    sttPaused: "Captions paused",
    offline: (elapsed: string) => `Offline · ${elapsed}`,
  },
  permission: {
    microphone: ["Orchestra can't use the microphone", "Your side isn't captioned. Their audio still is."],
    systemAudio: ["Orchestra can't hear the call audio", "Their side isn't captioned. Yours still is."],
    screen: ["Orchestra can't see the screen", "Look is off until you allow screen recording. Captions still work."],
    senses: { microphone: "Microphone", systemAudio: "System audio", screen: "Screen" },
    states: { granted: "On", denied: "No permission", "on-request": "On request" },
    settings: "Open System Settings",
  },
  stt: {
    title: (attempt: number) => `Reconnecting to transcription · attempt ${attempt}`,
    body: (watermark: string) =>
      `Audio from the last 30 s is kept and resent when the link is back. Answers use the transcript up to ${watermark}.`,
    next: (seconds: number) => `next try in ${seconds} s`,
    retry: "Retry now",
  },
  hotkey: {
    title: "is taken by another app",
    body: (name: string) => `${name} has no shortcut until you pick a new one. The other shortcuts still work.`,
    change: "Change shortcut",
    names: { ask: "Ask", look: "Look", toggle: "Show and hide", stop: "Stop", previous: "Paging", next: "Paging" },
  },
  network: {
    title: "No network",
    body: "Captions and answers are paused. The last 30 s of audio is kept and sent once you're back online; anything older isn't captioned.",
    recording: "Recording continues",
  },
  ended: "Meeting ended",
  minutes: (title: string, minutes: number) => `${title} · ${minutes} min`,
  pending: {
    off: "Capture and shortcuts are off.",
    writing: "Writing the summary and a follow-up draft…",
    hint: "Usually under 20 s. You can close this; it lands in the live seat's session.",
  },
  ready: {
    saved: "Saved to memory",
    decisions: "Decisions",
    openItems: "Open items",
    followUp: "Follow-up draft",
    nothingSent: "Nothing is sent from here.",
    copyDraft: "Copy draft",
    send: (count: number) => `Send ${count} open ${count === 1 ? "item" : "items"} to Maestro`,
  },
  suggestion: { why: "Asked of you · clears when the topic moves on", dismiss: "Not now", answer: "Answer" },
  close: "Close",
}

const sourceIcons: Record<LiveOverlaySource, string> = { heard: "ear", screen: "screen", memory: "memory" }
const mac = navigator.userAgent.includes("Mac")

function LiveOverlay() {
  const [state, setState] = createSignal<LiveOverlayState>()
  const [now, setNow] = createSignal(Date.now())
  let glass: HTMLDivElement | undefined

  onMount(() => {
    void window.live.state().then((initial) => initial && setState(initial))
    const unsubscribe = window.live.onState(setState)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    const escape = (event: KeyboardEvent) => event.key === "Escape" && window.live.releaseFocus()
    window.addEventListener("keydown", escape)
    // Main sizes the window to the glass, so the overlay grows downward with its content.
    const observer = new ResizeObserver(() => glass && window.live.resize(glass.offsetHeight))
    if (glass) observer.observe(glass)
    onCleanup(() => {
      unsubscribe()
      clearInterval(clock)
      window.removeEventListener("keydown", escape)
      observer.disconnect()
    })
  })

  // Dragging anywhere on the bar moves the window; main follows the cursor until the pointer is released.
  const dragStart = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest("button, input")) return
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    window.live.moveBegin()
  }
  const dragEnd = () => window.live.moveEnd()

  return (
    <Show when={state()}>
      {(current) => {
        const view = () => current().view
        const failed = (hotkey: LiveOverlayHotkey) => current().failedHotkeys.includes(hotkey)
        const elapsed = () => clock(current().startedAt ? now() - current().startedAt! : 0)
        return (
          <div
            ref={glass}
            class="ov"
            data-moving={current().moving ? "" : undefined}
            onPointerEnter={() => window.live.interactive(true)}
            onPointerLeave={() => window.live.interactive(false)}
          >
            <Switch
              fallback={
                <>
                  <div class="bar" onPointerDown={dragStart} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
                    <span class="rec">
                      <span class="dot" />
                      {elapsed()}
                    </span>
                    <span class="who">
                      <b>{copy.label}</b>
                      <span>{status(current())}</span>
                    </span>
                    <span class="flex" />
                    <Switch
                      fallback={
                        <>
                          <button
                            class="btn"
                            classList={{ failed: failed("ask") }}
                            onClick={() => window.live.act({ kind: "ask" })}
                          >
                            {copy.ask}
                            <Keys accelerator={current().accelerators.ask} />
                          </button>
                          <button
                            class="btn"
                            classList={{ failed: failed("look") }}
                            onClick={() => window.live.act({ kind: "look" })}
                          >
                            {copy.look}
                            <Keys accelerator={current().accelerators.look} />
                          </button>
                        </>
                      }
                    >
                      <Match when={current().moving}>
                        <span class="btn hover">
                          <Icon id="move" size="s14" />
                          {copy.move}
                          <Keys accelerator="Alt+Left+Up+Down+Right" />
                        </span>
                      </Match>
                      <Match when={view().kind === "answer" && current().answers.length > 0}>
                        <span class="pager">
                          <button
                            class="ib"
                            disabled={current().answerIndex === 0}
                            onClick={() => window.live.act({ kind: "page", step: -1 })}
                          >
                            <Icon id="left" />
                          </button>
                          <span class="n">{copy.page(current().answerIndex + 1, current().answers.length)}</span>
                          <button
                            class="ib"
                            disabled={current().answerIndex === current().answers.length - 1}
                            onClick={() => window.live.act({ kind: "page", step: 1 })}
                          >
                            <Icon id="right" />
                          </button>
                        </span>
                        <Keys accelerator={current().accelerators.previous} />
                        <Keys accelerator={current().accelerators.next} />
                      </Match>
                    </Switch>
                    <span class="sep" />
                    <button
                      class="ib"
                      classList={{ on: view().kind === "captions" }}
                      title={copy.captions}
                      onClick={() => window.live.act({ kind: "toggle-captions" })}
                    >
                      <Icon id="cc" />
                    </button>
                    <button
                      class="ib"
                      classList={{ on: current().suggestions }}
                      title={copy.suggestions}
                      onClick={() => window.live.act({ kind: "toggle-suggestions" })}
                    >
                      <Icon id="bulb" />
                    </button>
                    <Show when={current().contentProtection}>
                      <span class="ib" title={copy.protected}>
                        <Icon id="shield" />
                      </span>
                    </Show>
                    <span class="sep" />
                    <button
                      class="ib stop"
                      title={`${copy.stop} ${keys(current().accelerators.stop).join("")}`}
                      onClick={() => window.live.act({ kind: "stop" })}
                    >
                      <Icon id="stop" />
                    </button>
                  </div>
                  <Show when={current().error}>
                    {(error) => (
                      <>
                        <div class="seam" />
                        <ErrorNote error={error()} state={current()} />
                      </>
                    )}
                  </Show>
                  <Body view={view()} state={current()} />
                </>
              }
            >
              <Match when={view().kind === "stop-pending" || view().kind === "stop-ready"}>
                <Ended
                  view={view() as Extract<LiveOverlayView, { kind: "stop-pending" | "stop-ready" }>}
                  onPointerDown={dragStart}
                  onPointerUp={dragEnd}
                />
              </Match>
            </Switch>
          </div>
        )
      }}
    </Show>
  )
}

function Body(props: { view: LiveOverlayView; state: LiveOverlayState }) {
  const answer = () => props.state.answers[props.state.answerIndex]
  return (
    <Switch>
      <Match when={props.view.kind === "answer" && answer()}>{(current) => <Answer answer={current()} />}</Match>
      <Match when={props.view.kind === "quick"}>
        <div class="seam" />
        <Quick />
      </Match>
      <Match when={props.view.kind === "captions" && props.view}>
        {(view) => (
          <>
            <div class="seam" />
            <div class="cap">
              <For each={(view() as Extract<LiveOverlayView, { kind: "captions" }>).lines}>
                {(line) => (
                  <>
                    <span class="tk">{copy.tracks[line.track]}</span>
                    <CaptionLine text={line.text} partial={line.partial} />
                  </>
                )}
              </For>
            </div>
          </>
        )}
      </Match>
      <Match when={props.view.kind === "suggestion" && props.view}>
        {(view) => (
          <>
            <div class="seam" />
            <div class="sugg">
              <Icon id="bulb" />
              <span class="said">“{(view() as Extract<LiveOverlayView, { kind: "suggestion" }>).question}”</span>
              <span class="why">{copy.suggestion.why}</span>
              <span class="act">
                <button class="btn" onClick={() => window.live.act({ kind: "suggestion", answer: false })}>
                  {copy.suggestion.dismiss}
                </button>
                <button class="btn primary" onClick={() => window.live.act({ kind: "suggestion", answer: true })}>
                  {copy.suggestion.answer}
                  <Keys accelerator={props.state.accelerators.ask} />
                </button>
              </span>
            </div>
          </>
        )}
      </Match>
    </Switch>
  )
}

function Answer(props: { answer: LiveOverlayAnswer }) {
  const sources = () => [...new Set(props.answer.points.map((point) => point.source))]
  return (
    <>
      <div class="seam" />
      <div class="sect">
        <Show when={props.answer.question}>
          <div class="q">
            <Icon id="ask" size="s14" />
            {props.answer.question}
          </div>
        </Show>
        <p class="lead">{props.answer.lead}</p>
        <ul class="pts">
          <For each={props.answer.points}>
            {(point) => (
              <li>
                <Icon id={sourceIcons[point.source]} size="s14" />
                <span>{point.text}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
      <div class="foot">
        <For each={sources()}>
          {(source) => (
            <span class="chip">
              <Icon id={sourceIcons[source]} size="s12" />
              {copy.sources[source]}
            </span>
          )}
        </For>
        <span class="flex" />
        <button
          class="ib"
          title={copy.copy}
          onClick={() =>
            window.live.act({
              kind: "copy",
              text: [props.answer.lead, ...props.answer.points.map((point) => `- ${point.text}`)].join("\n"),
            })
          }
        >
          <Icon id="copy" />
        </button>
      </div>
    </>
  )
}

// The one place the overlay takes key focus: main makes the window focusable while this field is in use.
function Quick() {
  const [question, setQuestion] = createSignal("")
  const ask = (event: SubmitEvent) => {
    event.preventDefault()
    const text = question().trim()
    if (!text) return
    window.live.act({ kind: "ask", question: text })
    setQuestion("")
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  return (
    <div class="sect quick">
      <form class="field" onSubmit={ask}>
        <Icon id="ask" size="s14" />
        <input
          value={question()}
          placeholder={copy.placeholder}
          onInput={(event) => setQuestion(event.currentTarget.value)}
          onFocus={() => window.live.requestFocus()}
          onBlur={() => window.live.releaseFocus()}
        />
        <Keys accelerator="Enter" />
      </form>
      <div class="qa">
        <For each={["say", "follow-up", "fact-check", "recap"] as const}>
          {(id) => (
            <button
              class="btn"
              classList={{ primary: id === "say" }}
              onClick={() => window.live.act({ kind: "quick", id })}
            >
              <Icon id={{ say: "say", "follow-up": "ask", "fact-check": "check", recap: "list" }[id]} size="s14" />
              {copy.quick[id]}
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

// Long lines keep their newest words in view; the fade at the left edge applies only once a line overflows.
function CaptionLine(props: { text: string; partial: string }) {
  let line: HTMLDivElement | undefined
  const [overflow, setOverflow] = createSignal(false)
  createEffect(() => {
    void (props.text + props.partial)
    queueMicrotask(() => line && setOverflow(line.scrollWidth > line.clientWidth))
  })
  return (
    <div ref={line} class="line" style={overflow() ? undefined : { "-webkit-mask": "none", mask: "none" }}>
      <span>
        {props.text}
        <Show when={props.partial}>
          {" "}
          <span class="partial">{props.partial}</span>
          <span class="caret" />
        </Show>
      </span>
    </div>
  )
}

function ErrorNote(props: { error: LiveOverlayError; state: LiveOverlayState }) {
  return (
    <Switch>
      <Match when={props.error.kind === "permission" && props.error}>
        {(error) => {
          const missing = () => {
            const current = error() as Extract<LiveOverlayError, { kind: "permission" }>
            if (current.microphone === "denied") return "microphone" as const
            if (current.systemAudio === "denied") return "systemAudio" as const
            return "screen" as const
          }
          const senses = () => error() as Extract<LiveOverlayError, { kind: "permission" }>
          return (
            <div class="note">
              <Icon id={{ microphone: "mic-off", systemAudio: "ear", screen: "screen" }[missing()]} />
              <b>{copy.permission[missing()][0]}</b>
              <p>{copy.permission[missing()][1]}</p>
              <div class="senses">
                <For each={["microphone", "systemAudio", "screen"] as const}>
                  {(sense) => <Sense name={copy.permission.senses[sense]} value={senses()[sense]} />}
                </For>
              </div>
              <div class="act">
                <button class="btn" onClick={() => window.live.act({ kind: "open-settings" })}>
                  {copy.permission.settings}
                </button>
              </div>
            </div>
          )
        }}
      </Match>
      <Match when={props.error.kind === "stt" && props.error}>
        {(error) => {
          const stt = () => error() as Extract<LiveOverlayError, { kind: "stt" }>
          return (
            <div class="note">
              <Icon id="sync" />
              <b>{copy.stt.title(stt().attempt)}</b>
              <p>{copy.stt.body(clock(stt().watermarkMs))}</p>
              <span class="reason">
                {stt().reason} · {stt().closeCode}
              </span>
              <div class="act">
                <span class="meta">{copy.stt.next(stt().retryInSeconds)}</span>
                <button class="btn" onClick={() => window.live.act({ kind: "retry" })}>
                  {copy.stt.retry}
                </button>
              </div>
            </div>
          )
        }}
      </Match>
      <Match when={props.error.kind === "hotkey" && props.error}>
        {(error) => (
          <div class="note">
            <Icon id="key" />
            <b>
              <Keys accelerator={(error() as Extract<LiveOverlayError, { kind: "hotkey" }>).accelerator} />
              {copy.hotkey.title}
            </b>
            <p>{copy.hotkey.body(copy.hotkey.names[props.state.failedHotkeys[0] ?? "ask"])}</p>
            <div class="act">
              <button class="btn" onClick={() => window.live.act({ kind: "change-shortcut" })}>
                {copy.hotkey.change}
              </button>
            </div>
          </div>
        )}
      </Match>
      <Match when={props.error.kind === "network"}>
        <div class="note">
          <Icon id="wifi-off" />
          <b>{copy.network.title}</b>
          <p>{copy.network.body}</p>
          <div class="act">
            <span class="meta">{copy.network.recording}</span>
          </div>
        </div>
      </Match>
    </Switch>
  )
}

function Sense(props: { name: string; value: LiveOverlaySense }) {
  return (
    <span class="sense">
      <i classList={{ bad: props.value === "denied" }} />
      {props.name} · {copy.permission.states[props.value]}
    </span>
  )
}

function Ended(props: {
  view: Extract<LiveOverlayView, { kind: "stop-pending" | "stop-ready" }>
  onPointerDown: (event: PointerEvent) => void
  onPointerUp: () => void
}) {
  const ready = () => (props.view.kind === "stop-ready" ? props.view : undefined)
  return (
    <>
      <div class="head" onPointerDown={props.onPointerDown} onPointerUp={props.onPointerUp}>
        <span class="rec off">
          <span class="dot" />
          {clock(props.view.durationMs)}
        </span>
        <span class="who">
          <b>{copy.ended}</b>
          <span>{copy.minutes(props.view.title, Math.round(props.view.durationMs / 60000))}</span>
        </span>
        <span class="flex" />
        <Show when={ready()?.saved}>
          <span class="ok-line">
            <Icon id="saved" size="s14" />
            {copy.ready.saved}
          </span>
        </Show>
        <button class="ib" title={copy.close} onClick={() => window.live.act({ kind: "close" })}>
          <Icon id="x" />
        </button>
      </div>
      <div class="seam" />
      <Show
        when={ready()}
        fallback={
          <div class="sect">
            <div class="q">
              <Icon id="check" size="s14" />
              {copy.pending.off}
            </div>
            <p class="lead pending">{copy.pending.writing}</p>
            <p class="meta">{copy.pending.hint}</p>
          </div>
        }
      >
        {(view) => (
          <>
            <div class="sect sum">
              <Show when={view().decisions.length > 0}>
                <h3 class="eyebrow">{copy.ready.decisions}</h3>
                <ul>
                  <For each={view().decisions}>{(decision) => <li>{decision}</li>}</For>
                </ul>
              </Show>
              <Show when={view().openItems.length > 0}>
                <h3 class="eyebrow">{copy.ready.openItems}</h3>
                <ul>
                  <For each={view().openItems}>
                    {(item) => (
                      <li>
                        {item.text}
                        <span class="own">{item.owner}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={view().followUp}>
                <h3 class="eyebrow">{copy.ready.followUp}</h3>
                <div class="draft">{view().followUp}</div>
              </Show>
            </div>
            <div class="foot end">
              <span class="meta">{copy.ready.nothingSent}</span>
              <span class="flex" />
              <Show when={view().followUp}>
                <button class="btn sec" onClick={() => window.live.act({ kind: "copy", text: view().followUp })}>
                  <Icon id="copy" size="s14" />
                  {copy.ready.copyDraft}
                </button>
              </Show>
              <Show when={view().openItems.length > 0}>
                <button class="btn primary" onClick={() => window.live.act({ kind: "send-open-items" })}>
                  <Icon id="send" size="s14" />
                  {copy.ready.send(view().openItems.length)}
                </button>
              </Show>
            </div>
          </>
        )}
      </Show>
    </>
  )
}

function status(state: LiveOverlayState) {
  const error = state.error
  if (error?.kind === "network") return copy.status.offline(clock(error.offlineMs))
  if (error?.kind === "stt") return copy.status.sttPaused
  if (error?.kind === "permission" && error.microphone === "denied") return copy.status.micOff
  if (error?.kind === "permission" && error.systemAudio === "denied") return copy.status.audioOff
  const answer = state.answers[state.answerIndex]
  if (state.view.kind === "answer" && answer) return copy.answered((answer.latencyMs / 1000).toFixed(1))
  return copy.listening
}

function Keys(props: { accelerator: string }) {
  return (
    <span class="keys">
      <For each={keys(props.accelerator)}>{(key) => <span class="key">{key}</span>}</For>
    </span>
  )
}

// Electron accelerator to the glyphs a person presses, e.g. "CommandOrControl+Shift+Enter" to ⌘ ⇧ ⏎ on macOS.
function keys(accelerator: string) {
  const glyphs: Record<string, string> = {
    CommandOrControl: mac ? "⌘" : "Ctrl",
    CmdOrCtrl: mac ? "⌘" : "Ctrl",
    Command: "⌘",
    Cmd: "⌘",
    Control: mac ? "⌃" : "Ctrl",
    Ctrl: mac ? "⌃" : "Ctrl",
    Shift: "⇧",
    Alt: mac ? "⌥" : "Alt",
    Option: "⌥",
    Enter: "⏎",
    Return: "⏎",
    Left: "←",
    Right: "→",
    Up: "↑",
    Down: "↓",
    Plus: "+",
  }
  return accelerator.split("+").map((part) => glyphs[part] ?? part.toUpperCase())
}

function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, "0")
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
  return `${minutes}:${rest}`
}

function Icon(props: { id: string; size?: "s14" | "s12" }) {
  return (
    <svg class={props.size}>
      <use href={`#i-${props.id}`} />
    </svg>
  )
}

function Symbols(): JSX.Element {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="i-mic-off" viewBox="0 0 16 16">
        <path d="M10.5 6.5v-2a2.5 2.5 0 0 0-5 0v3M12.75 7.5a4.7 4.7 0 0 1-.6 2.3M3.25 7.5a4.75 4.75 0 0 0 7.2 4.07M8 12.25v2M2 2l12 12" />
      </symbol>
      <symbol id="i-ear" viewBox="0 0 16 16">
        <path d="M2 6.5v3M5 4v8M8 2.5v11M11 5v6M14 6.5v3" />
      </symbol>
      <symbol id="i-screen" viewBox="0 0 16 16">
        <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" />
        <path d="M5.5 14h5M8 11.25V14" />
      </symbol>
      <symbol id="i-memory" viewBox="0 0 16 16">
        <path d="M8 2.25a5.75 5.75 0 1 1-5.6 4.4" />
        <path d="M2.25 2.75v3.5h3.5M8 5v3.25l2 1.5" />
      </symbol>
      <symbol id="i-cc" viewBox="0 0 16 16">
        <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2" />
        <path d="M7 6.6a1.9 1.9 0 1 0 0 2.8M11.5 6.6a1.9 1.9 0 1 0 0 2.8" />
      </symbol>
      <symbol id="i-bulb" viewBox="0 0 16 16">
        <path d="M6 12.25h4M6.5 14.25h3M8 1.75a4.25 4.25 0 0 0-2.4 7.76c.5.35.9.9.9 1.5v.24h3v-.24c0-.6.4-1.15.9-1.5A4.25 4.25 0 0 0 8 1.75z" />
      </symbol>
      <symbol id="i-shield" viewBox="0 0 16 16">
        <path d="M8 1.75 2.75 3.75v4c0 3.2 2.2 5.4 5.25 6.5 3.05-1.1 5.25-3.3 5.25-6.5v-4z" />
        <path d="M5.75 8l1.6 1.6 2.9-3" />
      </symbol>
      <symbol id="i-stop" viewBox="0 0 16 16">
        <rect x="3.75" y="3.75" width="8.5" height="8.5" rx="1.5" />
      </symbol>
      <symbol id="i-left" viewBox="0 0 16 16">
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </symbol>
      <symbol id="i-right" viewBox="0 0 16 16">
        <path d="M6 3.5 10.5 8 6 12.5" />
      </symbol>
      <symbol id="i-x" viewBox="0 0 16 16">
        <path d="M4 4l8 8M12 4l-8 8" />
      </symbol>
      <symbol id="i-copy" viewBox="0 0 16 16">
        <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.5" />
        <path d="M10.75 5.25V3.75a1.5 1.5 0 0 0-1.5-1.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5h1.5" />
      </symbol>
      <symbol id="i-say" viewBox="0 0 16 16">
        <path d="M2.25 4.25a2 2 0 0 1 2-2h7.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7l-3.25 2.5v-2.5h0a1.5 1.5 0 0 1-1.5-1.5z" />
      </symbol>
      <symbol id="i-ask" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.4M8 11.4v.1" />
      </symbol>
      <symbol id="i-check" viewBox="0 0 16 16">
        <path d="M3 8.5l3.2 3.2L13 4.75" />
      </symbol>
      <symbol id="i-list" viewBox="0 0 16 16">
        <path d="M5.75 4h8M5.75 8h8M5.75 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
      </symbol>
      <symbol id="i-sync" viewBox="0 0 16 16">
        <path d="M13.25 8A5.25 5.25 0 0 1 3.9 11.3M2.75 8A5.25 5.25 0 0 1 12.1 4.7" />
        <path d="M12.4 2v2.9H9.5M3.6 14v-2.9h2.9" />
      </symbol>
      <symbol id="i-key" viewBox="0 0 16 16">
        <rect x="1.75" y="4.25" width="12.5" height="7.5" rx="1.5" />
        <path d="M4.5 7h.01M6.75 7h.01M9 7h.01M11.5 7h.01M5 9.25h6" />
      </symbol>
      <symbol id="i-wifi-off" viewBox="0 0 16 16">
        <path d="M1.75 6a9 9 0 0 1 3-1.9M7 3.6a9 9 0 0 1 7.25 2.4M3.9 8.8A5 5 0 0 1 6.5 7.4M10.2 7.6a5 5 0 0 1 1.9 1.2M6 11.4a2.8 2.8 0 0 1 4 0M8 13.4h.01M2 2l12 12" />
      </symbol>
      <symbol id="i-send" viewBox="0 0 16 16">
        <path d="M2.25 8h10M8.75 3.75 13 8l-4.25 4.25" />
      </symbol>
      <symbol id="i-move" viewBox="0 0 16 16">
        <path d="M8 1.75v12.5M1.75 8h12.5M6 3.75 8 1.75l2 2M6 12.25l2 2 2-2M3.75 6 1.75 8l2 2M12.25 6l2 2-2 2" />
      </symbol>
      <symbol id="i-saved" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M5.25 8.25 7.2 10.2l3.55-3.7" />
      </symbol>
    </svg>
  )
}

render(
  () => (
    <>
      <Symbols />
      <LiveOverlay />
    </>
  ),
  document.getElementById("live")!,
)
