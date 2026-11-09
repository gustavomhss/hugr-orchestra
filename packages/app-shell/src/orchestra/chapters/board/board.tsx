import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { ServerBoardListOutput } from "@orchestra/client"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { MxBadge, MxToggle } from "../kit"
import { encode, Ring, Seat } from "./parts"
import { createBoardExtras, ExtrasHeader, ExtrasPanels, ExtrasProof } from "./extras"
import {
  age,
  across,
  unproven,
  attachmentKind,
  columns,
  credential,
  group,
  order,
  progress,
  refusal,
  shippedDay,
  step,
  steps,
  waitingOn,
  type Column,
  type Issue,
  type ExecutionReport,
  type Page,
  type Snapshot,
  type Trail,
} from "./model"
import { healthKey, shippedKey, stageKey } from "./keys"
import { Inbox } from "./inbox"
import { createReplyDrafts } from "./reply-drafts"
import { Intake } from "./intake"
import { IssueDiscussion } from "./discussion"
import { BoardWriteStatus } from "./write-status"
import { IssueTabs, type IssueArea } from "./issue-tabs"
import { ExecutionReceipt, IssueExecutions } from "./executions"
import { IssueHistory } from "./history"
import { IssueProperties } from "./properties"
import { Ticks, TrailView } from "./trail"
import { createReplay } from "./replay"
import "./board.css"
import { EpicPage, ListView, Overview, Timeline, ViewSwitch } from "./views"
import type { View } from "./plan"

type Summary = ServerBoardListOutput[number]
type Channel = "list" | "board" | "page"

// Shipped is a compact log; older rows fold into a count.
const shippedShown = 6
// Attachments travel base64 in one JSON request, so large files are refused before they are read.
const attachLimit = 25 * 1024 * 1024

// The Projects board (CONTRACT.md §7, slices C and D): Maestro moves the cards; the owner answers, adds notes and
// context, pauses and undoes. Every view refetches whenever the server says a project changed. It is cross-project,
// so it renders without a repository.
export default function Board() {
  const replies = createReplyDrafts()
  const language = useLanguage()
  const sdk = useServerSDK()
  const t = language.t
  const api = () => sdk().orchestra["server.board"]
  const [store, setStore] = createStore({
    projects: undefined as readonly Summary[] | undefined,
    listFailed: false,
    key: undefined as string | undefined,
    snapshot: undefined as Snapshot | undefined,
    boardFailed: false,
    fetchedAt: 0,
    trails: {} as Record<string, Trail>,
    focused: undefined as string | undefined,
    peek: undefined as string | undefined,
    full: false,
    page: undefined as Page | undefined,
    pageFailed: false,
    execution: undefined as ExecutionReport | undefined,
    executionFailed: false,
    issueArea: "overview" as IssueArea,
    busy: false,
    pendingWrite: undefined as { generation: number; ref: string } | undefined,
    failure: undefined as string | undefined,
    writeStatus: undefined as { ref: string; message: string } | undefined,
    detailGeneration: 0,
    draft: "",
    caught: false,
    secret: undefined as { name: string; value: string } | undefined,
    secretRevision: 0,
    secretBlocked: false,
    drop: undefined as string | undefined,
    inbox: false,
    creating: false,
    createdTitle: undefined as string | undefined,
    newTitle: "",
    newBody: "",
    newRevision: 0,
    generation: 0,
  })
  const channels: Partial<Record<Channel, AbortController>> = {}
  const begin = (name: Channel) => {
    channels[name]?.abort()
    const controller = new AbortController()
    channels[name] = controller
    return controller
  }
  const extras = createBoardExtras({
    api,
    t,
    key: () => store.key,
    issue: (ref) => store.snapshot?.issues.find((item) => item.ref === ref),
    refresh: (key) => (void loadBoard(key), void loadList()),
    enter: () => {
      if (protectSecret()) return false
      closePeek()
      return true
    },
  })
  onCleanup(() => Object.values(channels).forEach((controller) => controller?.abort()))
  let root: HTMLDivElement | undefined
  const [view, setView] = createSignal<View>("board")
  const [epic, setEpic] = createSignal<number>()
  // The epic page reads the project's snapshot; it shows only while that snapshot still holds the epic.
  const opened = createMemo(() => {
    const snapshot = store.snapshot
    const found = snapshot?.epics.find((item) => item.number === epic())
    return snapshot && found ? { snapshot, epic: found } : undefined
  })

  const loadList = () => {
    const controller = begin("list")
    return api()
      .list({}, { signal: controller.signal })
      .then(
        (result) => !controller.signal.aborted && setStore({ projects: result, listFailed: false }),
        () => !controller.signal.aborted && setStore({ listFailed: true }),
      )
  }

  const loadBoard = (key: string) => {
    const controller = begin("board")
    return api()
      .get({ key }, { signal: controller.signal })
      .then(
        async (result) => {
          if (controller.signal.aborted) return
          setStore("snapshot", reconcile(result, { key: "id" }))
          setStore({ boardFailed: false, fetchedAt: Date.now() })
          extras.sync(key)
          // Review cards show CI from the live git trail, which only the issue page carries.
          const review = result.issues.filter((issue) => issue.stage === "review" && issue.prNumber !== null)
          const pages = await Promise.allSettled(
            review.map((issue) => api().issue({ key, number: String(issue.number) }, { signal: controller.signal })),
          )
          if (controller.signal.aborted) return
          setStore(
            "trails",
            reconcile(
              Object.fromEntries(
                pages.flatMap((page, index) => (page.status === "fulfilled" ? [[review[index].ref, page.value.trail]] : [])),
              ),
            ),
          )
        },
        () => !controller.signal.aborted && setStore({ boardFailed: true }),
      )
  }

  const loadPage = (ref: string) => {
    const issue = store.snapshot?.issues.find((item) => item.ref === ref)
    if (!issue || !store.key) return
    const controller = begin("page")
    void extras.loadProof(ref)
    void api().execution({ key: store.key, number: String(issue.number) }, { signal: controller.signal }).then(
      (execution) => {
        if (controller.signal.aborted) return
        setStore("execution", reconcile(execution, { key: "n" }))
        setStore("executionFailed", false)
      },
      () => !controller.signal.aborted && setStore({ executionFailed: true }),
    )
    return api()
      .issue({ key: store.key, number: String(issue.number) }, { signal: controller.signal })
      .then(
        (result) => !controller.signal.aborted && setStore({ page: result, pageFailed: false }),
        () => !controller.signal.aborted && setStore({ pageFailed: true }),
      )
  }

  // One owner write at a time. A refusal shows the server's own words; success refetches here, and board.changed
  // refetches every other window.
  const write = (run: (key: string) => Promise<unknown>, scope: "issue" | "project" = "issue", target?: string) => {
    const key = store.key
    if (!key || store.busy) return Promise.resolve(false)
    const generation = store.generation
    const detail = store.detailGeneration
    const ref = target ?? (scope === "issue" ? store.peek : undefined) ?? key
    setStore({ busy: true, pendingWrite: { generation, ref }, failure: undefined, writeStatus: undefined })
    return run(key).then(
      () => {
        setStore({ busy: false, pendingWrite: undefined })
        if (store.generation !== generation) return false
        void loadBoard(key)
        if (scope === "issue" && detail !== store.detailGeneration) {
          if (store.peek === ref) void loadPage(ref)
          return false
        }
        if (store.peek) void loadPage(store.peek)
        return true
      },
      (error: unknown) => {
        setStore({ busy: false, pendingWrite: undefined })
        if (store.generation !== generation) return false
        if (scope === "project" || detail !== store.detailGeneration || ref !== store.peek) {
          setStore("writeStatus", { ref, message: refusal(error) ?? t("orchestra.board.write.failed") })
          return false
        }
        setStore("failure", refusal(error) ?? t("orchestra.board.write.failed"))
        return false
      },
    )
  }
  const answer = (question: { id: string; text: string; issue?: number | null }, option: string) => {
    if (!store.key) return
    const sent = replies.capture(store.key, question.id)
    return write((key) => api().answer({ key, id: question.id, option, text: sent.text.trim() || undefined })
      .then(() => replies.acknowledge(sent)), "project", t("orchestra.board.write.answer", { ref: question.issue == null ? store.key : `${store.key}-${question.issue}`, question: question.text }))
  }
  const addNote = (issue: number) => {
    const body = store.draft.trim()
    const draft = store.draft
    const ref = store.peek
    if (!body) return
    // A key never leaves as a note; the owner moves it into the vault first.
    if (credential(body)) return setStore("caught", true)
    return write((key) => api().note({ key, number: String(issue), body })).then((ok) => ok && store.peek === ref && store.draft === draft && setStore("draft", ""))
  }
  const toSecret = () => {
    const token = credential(store.draft)
    if (!token) return setStore("caught", false)
    setStore({ caught: false, draft: store.draft.replace(token, "").trim(), secret: { name: "", value: token }, secretRevision: store.secretRevision + 1, secretBlocked: false, issueArea: "overview" })
    queueMicrotask(() => root?.querySelector<HTMLInputElement>('.board-secret input[type="text"]')?.focus())
  }
  const saveSecret = (issue: number) => {
    const secret = store.secret ? { ...store.secret } : undefined
    const revision = store.secretRevision
    if (!secret?.name.trim() || !secret.value) return
    return write((key) =>
      api().attach({ key, number: String(issue), kind: "secret", name: secret.name.trim(), value: secret.value }),
    ).then((ok) => ok && store.secretRevision === revision && setStore({ secret: undefined, secretBlocked: false }))
  }
  const attach = (issue: number, files: readonly File[]) => {
    if (!files.length) return
    const big = files.find((file) => file.size > attachLimit)
    if (big) return setStore("failure", t("orchestra.board.attach.tooBig", { name: big.name }))
    return write((key) =>
      Promise.all(
        files.map(async (file) =>
          api().attach({
            key,
            number: String(issue),
            kind: attachmentKind(file.type),
            name: file.name,
            mime: file.type || undefined,
            data: await encode(file),
          }),
        ),
      ),
    )
  }
  const undo = (id: string) => write((key) => api().undo({ key, id }))
  const toggleProject = () =>
    write((key) => (store.snapshot?.project.status === "paused" ? api().resume({ key }) : api().pause({ key })), "project")
  const toggleIssue = (issue: Issue) =>
    write((key) =>
      issue.paused
        ? api().resumeIssue({ key, number: String(issue.number) })
        : api().pauseIssue({ key, number: String(issue.number) }),
    )
  const hold = (issue: Issue, value: boolean) => write((key) => api().hold({ key, number: String(issue.number), hold: value }))
  const droppable = (ref: string, issue: number) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return
      event.preventDefault()
      setStore("drop", ref)
    },
    onDragLeave: () => setStore("drop", undefined),
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      setStore("drop", undefined)
      void attach(issue, [...(event.dataTransfer?.files ?? [])])
    },
  })

  onMount(() => void loadList())
  onCleanup(
    sdk().event.listen((event) => {
      const details = event.details as { type: string; properties?: { project?: unknown; issue?: unknown } }
      if (details.type !== "board.changed") return
      void loadList()
      if (!store.key) return
      if (!store.snapshot || details.properties?.project !== store.snapshot.project.id) return
      void loadBoard(store.key)
      const open = store.page?.issue
      if (store.peek && (details.properties?.issue === undefined || details.properties.issue === open?.id))
        void loadPage(store.peek)
    }),
  )

  // Unsaved credentials stay only in memory. Every navigation path shares this fence, not just Escape.
  const protectSecret = () => {
    if (!store.secret) return false
    setStore({ secretBlocked: true, issueArea: "overview" })
    queueMicrotask(() => root?.querySelector<HTMLInputElement>('.board-secret input[type="text"]')?.focus())
    return true
  }
  const openEpic = (number?: number) => {
    if (protectSecret()) return
    setEpic(number)
  }
  const openProject = (key: string) => {
    if (protectSecret()) return
    setStore("generation", (value) => value + 1)
    channels.page?.abort()
    setStore({ key, snapshot: undefined, boardFailed: false, trails: {}, focused: undefined, peek: undefined, full: false, creating: false, newTitle: "", newBody: "", writeStatus: undefined, createdTitle: undefined, failure: undefined, draft: "", caught: false, secret: undefined, secretBlocked: false, page: undefined, execution: undefined, executionFailed: false, detailGeneration: store.detailGeneration + 1 })
    void loadBoard(key)
  }
  const closeProject = () => {
    if (protectSecret()) return
    setStore("generation", (value) => value + 1)
    channels.board?.abort()
    channels.page?.abort()
    setStore({ key: undefined, snapshot: undefined, peek: undefined, page: undefined, full: false, failure: undefined, writeStatus: undefined, createdTitle: undefined, draft: "", caught: false, secret: undefined, secretBlocked: false, execution: undefined, executionFailed: false, detailGeneration: store.detailGeneration + 1 })
    void loadList()
  }
  const openPeek = (ref: string) => {
    if (store.peek !== ref && protectSecret()) return
    if (store.peek !== ref) setStore({ detailGeneration: store.detailGeneration + 1, draft: "", caught: false, secret: undefined, failure: undefined, issueArea: "overview", execution: undefined, executionFailed: false })
    setStore({ peek: ref, focused: ref, page: store.page?.issue.ref === ref ? store.page : undefined, pageFailed: false })
    void loadPage(ref)
  }
  const closePeek = () => {
    if (protectSecret()) return
    channels.page?.abort()
    const ref = store.peek
    setStore({ detailGeneration: store.detailGeneration + 1, peek: undefined, full: false, page: undefined, draft: "", caught: false, secret: undefined, failure: undefined, execution: undefined })
    if (ref) focus(ref)
  }
  // The peek's button leaves the DOM when the page opens, so focus moves to the page to keep J, K and Esc working.
  const openFull = () => {
    setStore("full", true)
    requestAnimationFrame(() => root?.querySelector<HTMLElement>(".board-full")?.focus())
  }
  const focus = (ref: string) => {
    setStore("focused", ref)
    requestAnimationFrame(() => root?.querySelector<HTMLElement>(`[data-ref="${ref}"]`)?.focus())
  }

  const replay = createReplay({ key: () => store.key, snapshot: () => store.snapshot })
  const grouped = createMemo(() => group(replay.issues() ?? store.snapshot?.issues ?? []))
  const refs = createMemo(() => order(grouped().lanes))
  const plan = createMemo(() => progress(replay.issues() ?? store.snapshot?.issues ?? []))
  const asks = () => (store.projects ?? []).reduce((sum, item) => sum + item.openQuestions, 0)
  const needs = () => (
    <Show when={asks() > 0}>
      <button type="button" class="board-chip board-needs" onClick={() => {
        if (protectSecret()) return
        closePeek()
        setStore("inbox", true)
      }}>
        {t("orchestra.board.ask.title")} · <b>{asks()}</b>
      </button>
    </Show>
  )
  const epics = createMemo(() => new Map((store.snapshot?.epics ?? []).map((epic) => [epic.number, epic.title])))
  const questions = createMemo(() => (store.snapshot?.questions ?? []).filter((question) => question.status === "open"))
  const crew = createMemo(() => [
    ...new Set(
      (store.snapshot?.issues ?? [])
        .filter((issue) => (issue.stage === "building" || issue.stage === "review") && issue.seat)
        .map((issue) => issue.seat as string),
    ),
  ])
  const time = (value: number) =>
    new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value)
  const date = (value: number) => new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(value)

  const move = (next: string | undefined) => {
    if (!next) return
    if (protectSecret()) return
    focus(next)
    if (store.peek && store.peek !== next) openPeek(next)
  }
  const keydown = (event: KeyboardEvent) => {
    if (!store.snapshot || store.inbox) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const current = store.peek ?? store.focused
    if (key === "Escape" && extras.state.panel) return (event.preventDefault(), extras.closePanel())
    if (extras.state.panel) return
    if (key === "Escape" && store.secret) return (event.preventDefault(), void protectSecret())
    if (key === "Escape" && (event.target as HTMLElement).closest("textarea") && store.draft) return
    if (key === "Escape" && store.peek) return (event.preventDefault(), closePeek())
    // Typing a note or an answer never moves the board.
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, select, [contenteditable], .board-detail, .board-issue-tabs")) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    // Board navigation belongs to cards and the board/full-page surfaces, never an unrelated toolbar control.
    if (target.closest("button, a, [role=tab], [role=switch]") && !target.closest("[data-ref]")) return
    // Digits answer the top question only while the board view shows it.
    const top = view() === "board" && !opened() ? questions()[0] : undefined
    const choice = /^[1-9]$/.test(key) && !store.peek ? top?.options[Number(key) - 1] : undefined
    if (top && choice) return (event.preventDefault(), void answer(top, choice.id))
    if (key === "ArrowDown" || key === "j") return (event.preventDefault(), move(step(refs(), current, 1)))
    if (key === "ArrowUp" || key === "k") return (event.preventDefault(), move(step(refs(), current, -1)))
    if (store.full) return
    if (key === "ArrowRight") return (event.preventDefault(), move(across(grouped().lanes, current, 1)))
    if (key === "ArrowLeft") return (event.preventDefault(), move(across(grouped().lanes, current, -1)))
  }
  const cardKeydown = (event: KeyboardEvent, ref: string) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    openPeek(ref)
  }
  const tab = (ref: string) => (store.focused ? store.focused === ref : refs()[0] === ref) ? 0 : -1

  const Card = (props: { issue: Issue }) => {
    const progress = () => steps(props.issue)
    const question = () => (store.snapshot ? waitingOn(store.snapshot, props.issue) : undefined)
    const epic = () => (props.issue.epic === null ? undefined : epics().get(props.issue.epic))
    const after = () =>
      props.issue.dependsOn.filter(
        (ref) => store.snapshot?.issues.find((issue) => issue.ref === ref)?.stage !== "shipped",
      )
    return (
      <button
        type="button"
        class="board-card"
        classList={{
          "board-held": props.issue.paused,
          "board-open": store.peek === props.issue.ref,
          "board-drop": store.drop === props.issue.ref,
        }}
        data-ref={props.issue.ref}
        data-stage={props.issue.stage}
        data-changed={replay.changed(props.issue.number)}
        data-moved={replay.moved(props.issue.number)}
        tabindex={tab(props.issue.ref)}
        onClick={() => openPeek(props.issue.ref)}
        onKeyDown={(event) => cardKeydown(event, props.issue.ref)}
        onFocus={() => setStore("focused", props.issue.ref)}
        {...droppable(props.issue.ref, props.issue.number)}
      >
        <span class="board-card-top">
          <span class="board-id">{props.issue.ref}</span>
          <Show when={epic()}>{(title) => <span class="board-epic">{title()}</span>}</Show>
        </span>
        <span class="board-card-title">{props.issue.title}</span>
        <Show when={props.issue.stage === "building" && !props.issue.paused && progress().now}>
          {(now) => (
            <span class="board-now">
              <span>{now()}</span>
              <i class="board-caret" aria-hidden="true" />
            </span>
          )}
        </Show>
        <Show when={props.issue.stage === "building" && progress().total > 0}>
          <span class="board-steps">
            <span class="board-track" aria-hidden="true">
              <For each={props.issue.steps}>
                {(item) => <i data-state={item.status === "skipped" ? "done" : item.status} />}
              </For>
            </span>
            {t("orchestra.board.steps.of", { current: progress().current ?? progress().done, total: progress().total })}
          </span>
        </Show>
        <Show when={props.issue.paused}>
          <span class="board-held-note">
            {question() ? t("orchestra.board.paused.answer") : t("orchestra.board.paused.plain")}
          </span>
        </Show>
        <Show when={props.issue.holdBeforeMerge}>
          <span class="board-held-note">{t("orchestra.board.hold")}</span>
        </Show>
        <Show when={props.issue.stage === "review"}>
          <Ticks trail={store.trails[props.issue.ref]} />
        </Show>
        <span class="board-card-foot">
          <Seat seat={props.issue.seat} />
          <Show when={props.issue.prNumber}>{(pr) => <span class="board-mono">#{pr()}</span>}</Show>
          <For each={after()}>
            {(ref) => (
              <span class="board-dep">
                {t("orchestra.board.after")} <span class="board-mono">{ref}</span>
              </span>
            )}
          </For>
          <span class="board-spacer" />
          <Show when={props.issue.stage === "building" || props.issue.stage === "review"}>
            <span>{t("orchestra.board.day", { day: age(props.issue, Date.now()) })}</span>
          </Show>
        </span>
      </button>
    )
  }

  const Row = (props: { issue: Issue }) => {
    const epic = () => (props.issue.epic === null ? undefined : epics().get(props.issue.epic))
    return (
      <button
        type="button"
        class="board-row"
        data-ref={props.issue.ref}
        data-stage={props.issue.stage}
        data-changed={replay.changed(props.issue.number)}
        data-moved={replay.moved(props.issue.number)}
        tabindex={tab(props.issue.ref)}
        onClick={() => openPeek(props.issue.ref)}
        onKeyDown={(event) => cardKeydown(event, props.issue.ref)}
        onFocus={() => setStore("focused", props.issue.ref)}
      >
        <Show when={props.issue.stage === "shipped"}>
          <Ring stage="shipped" />
        </Show>
        <span class="board-row-text">
          <span class="board-row-title">{props.issue.title}</span>
          <span class="board-row-meta">
            <span class="board-mono">{props.issue.prNumber ? `#${props.issue.prNumber}` : props.issue.ref}</span>
            <Show when={props.issue.stage === "shipped" ? props.issue.seat : epic()}>{(text) => <span>{text()}</span>}</Show>
            <Show when={props.issue.stage === "backlog" && props.issue.estimate}>
              <span class="board-size" aria-label={t("orchestra.board.estimate", { size: (props.issue.estimate ?? "").toUpperCase() })}>
                {(props.issue.estimate ?? "").toUpperCase()}
              </span>
            </Show>
          </span>
        </span>
      </button>
    )
  }

  const Lane = (props: { stage: Column }) => {
    const issues = () => grouped().lanes[props.stage]
    const shipped = () =>
      issues()
        .slice(0, shippedShown)
        .map((issue) => ({ issue, day: shippedDay(issue, store.fetchedAt) }))
    return (
      <section class="board-col" data-stage={props.stage} aria-labelledby={`board-col-${props.stage}`}>
        <header class="board-col-head">
          <Ring stage={props.stage} />
          <b id={`board-col-${props.stage}`}>{t(stageKey[props.stage])}</b>
          <span class="board-count">{issues().length}</span>
          <Show when={props.stage === "ready"}>
            <em>{t("orchestra.board.col.ready")}</em>
          </Show>
          <Show when={props.stage === "review"}>
            <em>{t("orchestra.board.col.review")}</em>
          </Show>
        </header>
        <div class="board-list">
          <Show when={issues().length === 0}>
            <p class="board-quiet board-col-empty">{t("orchestra.board.col.empty")}</p>
          </Show>
          <Switch>
            <Match when={props.stage === "backlog"}>
              <For each={issues()}>{(issue) => <Row issue={issue} />}</For>
            </Match>
            <Match when={props.stage === "shipped"}>
              <For each={shipped()}>
                {(item, index) => (
                  <>
                    <Show when={index() === 0 || shipped()[index() - 1].day !== item.day}>
                      <div class="board-day">{t(shippedKey[item.day])}</div>
                    </Show>
                    <Row issue={item.issue} />
                  </>
                )}
              </For>
              <Show when={issues().length > shippedShown}>
                <p class="board-quiet board-more">
                  {language.plural("orchestra.board.shipped.more", issues().length - shippedShown)}
                </p>
              </Show>
            </Match>
            <Match when={true}>
              <For each={issues()}>{(issue) => <Card issue={issue} />}</For>
            </Match>
          </Switch>
        </div>
      </section>
    )
  }

  // One renderer for the peek and the full page; the page adds the properties rail and the whole activity log.
  const Detail = (props: { page: Page; full: boolean }) => {
    const issue = () => props.page.issue
    const progress = () => steps(issue())
    const epic = () => {
      const number = issue().epic
      return number === null ? undefined : epics().get(number)
    }
    const open = () => props.page.questions.filter((question) => question.status === "open")
    const execution = () => store.execution?.ref === issue().ref ? store.execution : undefined
    const index = () => refs().indexOf(issue().ref)
    let picker: HTMLInputElement | undefined
    return (
      <div class="board-detail" data-full={props.full}>
        <div class="board-detail-main">
          <div class="board-detail-top">
            <span class="board-id">{issue().ref}</span>
            <span class="board-chip">
              <Ring stage={issue().stage} />
              {t(stageKey[issue().stage])}
            </span>
            <span class="board-spacer" />
            <Show when={props.full}>
              <span class="board-quiet">{t("orchestra.board.pager", { index: index() + 1, total: refs().length })}</span>
            </Show>
            <Show when={!props.full}>
              <button type="button" class="mx-btn" onClick={openFull}>
                {t("orchestra.board.openPage")}
              </button>
            </Show>
            <button
              type="button"
              class="board-icon-button"
              aria-label={props.full ? t("orchestra.board.backToBoard") : t("orchestra.board.closePeek")}
              onClick={closePeek}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <h2 id="board-detail-title">{issue().title}</h2>
          <Show
            when={unproven(
              issue(),
              props.page.trail,
              extras.state.proof?.ref === issue().ref ? extras.state.proof : undefined,
            )}
          >
            {(claim) => (
              <div class="board-claim" role="status">
                <b>{t(claim().stage === "building" ? "orchestra.board.claim.building" : "orchestra.board.claim.review")}</b>
                <ul>
                  <Show when={claim().missing.includes("branch")}>
                    <li>{t("orchestra.board.trail.none")}</li>
                  </Show>
                  <Show when={claim().missing.includes("pr")}>
                    <li>{t("orchestra.proof.pr.none")}</li>
                  </Show>
                  <Show when={claim().attempts}>
                    {(attempts) => <li>{t("orchestra.proof.attempts", { n: attempts().n, of: attempts().of })}</li>}
                  </Show>
                  <Show when={claim().missing.includes("verified")}>
                    <li>{t("orchestra.proof.verified.none")}</li>
                  </Show>
                </ul>
              </div>
            )}
          </Show>
          <div class="board-meta">
            <Show when={epic()}>{(title) => <span>{title()}</span>}</Show>
            <Show when={issue().seat}>
              {(seat) => (
                <span>
                  <Seat seat={seat()} />
                  {seat()}
                </span>
              )}
            </Show>
            <span>{t("orchestra.board.day", { day: age(issue(), Date.now()) })}</span>
            <Show when={props.page.dependencies.blocks.length > 0}>
              <span>
                {t("orchestra.board.blocks")} <span class="board-mono">{props.page.dependencies.blocks.join(", ")}</span>
              </span>
            </Show>
          </div>
          <div class="board-controls">
            <button type="button" class="mx-btn" disabled={store.busy} onClick={() => void toggleIssue(issue())}>
              {issue().paused ? t("orchestra.board.resume.issue") : t("orchestra.board.pause.issue")}
            </button>
            <label class="board-hold">
              <MxToggle
                checked={issue().holdBeforeMerge}
                label={t("orchestra.board.holdToggle")}
                disabled={store.busy}
                onChange={(next) => void hold(issue(), next)}
              />
              <span>{t("orchestra.board.holdToggle")}</span>
            </label>
          </div>
          <Show when={store.failure}>
            {(failure) => (
              <p class="mx-error" role="alert">
                {failure()}
              </p>
            )}
          </Show>
          <IssueTabs id={issue().id} value={store.issueArea} onChange={(issueArea) => {
            setStore({ issueArea })
            queueMicrotask(() => root?.querySelector<HTMLElement>(".board-issue-tabs")?.scrollIntoView?.({ block: "nearest" }))
          }} />
          <div class="board-issue-panel board-issue-overview" role="tabpanel" id={`${issue().id}-panel-overview`} aria-labelledby={`${issue().id}-tab-overview`} hidden={store.issueArea !== "overview"} tabIndex={0}>
          <Show when={execution()}>{(report) => <ExecutionReceipt report={report()} stage={issue().stage} stageEnteredAt={issue().stageEnteredAt} time={time} />}</Show>
          <Show when={store.executionFailed && (issue().stage === "shipped" || issue().stage === "cut")}><p class="board-quiet">{t("orchestra.board.workspace.failed")}</p></Show>
          <Show when={issue().body}><section class="board-sec"><h3>{t("orchestra.board.workspace.description")}</h3><p class="board-body">{issue().body}</p></section></Show>
          <ExtrasProof extras={extras} cardRef={issue().ref} />

          <Show when={open().length > 0}>
            <section class="board-sec">
              <h3>{t("orchestra.board.sec.questions")}</h3>
              <For each={open()}>
                {(question) => {
                  return (
                    <div class="board-question">
                      <p>{question.text}</p>
                      <ul>
                        <For each={question.options}>
                          {(option) => (
                            <li>
                              <button
                                type="button"
                                class="board-option"
                                data-recommended={option.id === question.recommended}
                                disabled={store.busy}
                                onClick={() => void answer(question, option.id)}
                              >
                                <b>{option.label}</b>
                                <Show when={option.id === question.recommended}>
                                  <span class="board-quiet"> · {t("orchestra.board.recommended")}</span>
                                </Show>
                                <Show when={option.consequence}>
                                  <small>{option.consequence}</small>
                                </Show>
                              </button>
                            </li>
                          )}
                        </For>
                      </ul>
                      <input
                        value={replies.read(store.key!, question.id)}
                        onInput={(event) => replies.edit(store.key!, question.id, event.currentTarget.value)}
                        class="board-input"
                        type="text"
                        aria-label={t("orchestra.board.answer.text")}
                        placeholder={t("orchestra.board.answer.text")}
                      />
                    </div>
                  )
                }}
              </For>
            </section>
          </Show>

          <Show when={progress().total > 0}>
            <section class="board-sec">
              <h3>
                {t("orchestra.board.sec.steps")}
                <span class="board-count">{t("orchestra.board.steps.done", { done: progress().done, total: progress().total })}</span>
              </h3>
              <ol class="board-plan">
                <For each={issue().steps}>
                  {(item) => (
                    <li data-state={item.status}>
                      <span class="board-plan-mark" aria-hidden="true" />
                      <span>
                        {item.title}
                        <Show when={item.status === "active" && item.now}>
                          {(now) => <small class="board-now board-now-line">{now()}</small>}
                        </Show>
                      </span>
                    </li>
                  )}
                </For>
              </ol>
            </section>
          </Show>

          <section class="board-sec">
            <h3>{t("orchestra.board.sec.git")}</h3>
            <TrailView trail={props.page.trail} branch={issue().branch} />
          </section>

          <section class="board-sec" classList={{ "board-drop": store.drop === issue().ref }} {...droppable(issue().ref, issue().number)}>
            <h3>
              {t("orchestra.board.sec.attachments")}
              <span class="board-count">{props.page.attachments.length}</span>
            </h3>
            <Show when={props.page.attachments.length > 0}>
              <ul class="board-files">
                <For each={props.page.attachments}>
                  {(file) => (
                    <li data-kind={file.kind}>
                      {/* A secret's name is its label. Its value never reaches the app. */}
                      <span>{file.name}</span>
                      <span class="board-quiet">
                        {file.kind === "secret" ? t("orchestra.board.secret") : t(`orchestra.board.kind.${file.kind}`)}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Show
              when={store.secret}
              fallback={
                <div class="board-add">
                  <input
                    ref={picker}
                    type="file"
                    multiple
                    hidden
                    onChange={(event) => {
                      void attach(issue().number, [...(event.currentTarget.files ?? [])])
                      event.currentTarget.value = ""
                    }}
                  />
                  <button type="button" class="mx-btn" disabled={store.busy} onClick={() => picker?.click()}>
                    {t("orchestra.board.attach.file")}
                  </button>
                  <button type="button" class="mx-btn" disabled={store.busy} onClick={() => setStore({ secret: { name: "", value: "" }, secretRevision: store.secretRevision + 1, secretBlocked: false })}>
                    {t("orchestra.board.attach.secret")}
                  </button>
                  <span class="board-quiet">{t("orchestra.board.attach.drop")}</span>
                </div>
              }
            >
              {(secret) => (
                <form
                  class="board-secret"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveSecret(issue().number)
                  }}
                >
                  <label class="mx-field">
                    <span>{t("orchestra.board.secret.name")}</span>
                    <input
                      type="text"
                      value={secret().name}
                      onInput={(event) => setStore({ secret: { ...secret(), name: event.currentTarget.value }, secretRevision: store.secretRevision + 1 })}
                    />
                  </label>
                  <label class="mx-field">
                    <span>{t("orchestra.board.secret.value")}</span>
                    <input
                      type="password"
                      autocomplete="off"
                      value={secret().value}
                      onInput={(event) => setStore({ secret: { ...secret(), value: event.currentTarget.value }, secretRevision: store.secretRevision + 1 })}
                    />
                  </label>
                  <p class="board-quiet">{t("orchestra.board.secret.hint")}</p>
                  <Show when={store.secretBlocked}><p class="board-quiet" role="status">{t("orchestra.board.secret.leave")}</p></Show>
                  <div class="board-add">
                    <button
                      type="submit"
                      class="mx-btn"
                      disabled={store.busy || !secret().name.trim() || !secret().value}
                    >
                      {t("orchestra.board.secret.save")}
                    </button>
                    <button type="button" class="mx-btn" disabled={store.busy} onClick={() => setStore({ secret: undefined, secretRevision: store.secretRevision + 1, secretBlocked: false })}>
                      {t("orchestra.board.cancel")}
                    </button>
                  </div>
                </form>
              )}
            </Show>
          </section>

          </div>
          <div class="board-issue-panel" role="tabpanel" id={`${issue().id}-panel-conversation`} aria-labelledby={`${issue().id}-tab-conversation`} hidden={store.issueArea !== "conversation"} tabIndex={0}>
          <IssueDiscussion channel="comments" issueID={issue().id} notes={props.page.notes} time={time}>
            <form
              class="board-composer"
              onSubmit={(event) => {
                event.preventDefault()
                void addNote(issue().number)
              }}
            >
              <textarea
                class="board-input"
                rows={2}
                value={store.draft}
                aria-label={t("orchestra.board.note.placeholder")}
                placeholder={t("orchestra.board.note.placeholder")}
                onInput={(event) => setStore({ draft: event.currentTarget.value, caught: false })}
              />
              <Show when={store.caught}>
                <div class="board-caught" role="alert">
                  <p>{t("orchestra.board.note.secret")}</p>
                  <button type="button" class="mx-btn" onClick={toSecret}>
                    {t("orchestra.board.note.toSecret")}
                  </button>
                </div>
              </Show>
              <div class="board-add">
                <button type="submit" class="mx-btn primary" disabled={store.busy || store.caught || !store.draft.trim()}>
                  {t("orchestra.board.note.send")}
                </button>
              </div>
            </form>
          </IssueDiscussion>
          </div>
          <div class="board-issue-panel" role="tabpanel" id={`${issue().id}-panel-executions`} aria-labelledby={`${issue().id}-tab-executions`} hidden={store.issueArea !== "executions"} tabIndex={0}>
            <IssueExecutions report={execution()} failed={store.executionFailed} page={props.page} time={time} retry={() => void loadPage(issue().ref)} />
          </div>

          <IssueHistory
            issueID={issue().id}
            activity={props.page.activity}
            busy={store.busy}
            active={store.issueArea === "history"}
            onUndo={(id) => void undo(id)}
            time={time}
          />
        </div>

          <IssueProperties
            page={props.page}
            execution={execution()}
            failed={store.executionFailed}
            epic={epic()}
            retry={() => void loadPage(issue().ref)}
            date={date}
            time={time}
          />
      </div>
    )
  }

  const DetailState = (props: { full: boolean }) => (
    <Switch>
      <Match when={store.page && store.page.issue.ref === store.peek && store.page}>
        {(page) => <Detail page={page()} full={props.full} />}
      </Match>
      <Match when={store.pageFailed}>
        <div class="mx-empty">
          <strong>{t("orchestra.board.issueFailed")}</strong>
          <button type="button" class="mx-btn" onClick={() => store.peek && loadPage(store.peek)}>
            {t("orchestra.board.retry")}
          </button>
        </div>
      </Match>
      <Match when={store.snapshot && store.peek && !store.snapshot.issues.some((item) => item.ref === store.peek)}>
        <div class="mx-empty">
          <strong>{t("orchestra.board.issueMissing")}</strong>
          <span>{t("orchestra.board.issueMissing.body")}</span>
        </div>
      </Match>
      <Match when={true}>
        <p class="board-quiet board-loading">{t("orchestra.board.loadingIssue")}</p>
      </Match>
    </Switch>
  )

  return (
    <div class="board-root mx-page" ref={root} onKeyDown={keydown}>
      <BoardWriteStatus status={store.writeStatus} onDismiss={() => setStore("writeStatus", undefined)} />
      <Show when={store.busy && store.pendingWrite && store.pendingWrite.generation !== store.generation}><p class="board-quiet" role="status">{t("orchestra.board.write.waiting", { ref: store.pendingWrite!.ref })}</p></Show>
      <Show when={store.inbox}>
        <Inbox
          replies={replies}
          onOpen={(key) => (setStore("inbox", false), openProject(key))}
          onClose={() => (setStore("inbox", false), store.key ? void loadBoard(store.key) : void loadList())}
        />
      </Show>
      <Show
        when={store.key && !store.inbox}
        fallback={!store.inbox && (
          <section class="board-page" aria-labelledby="board-projects-title">
            <header class="board-head">
              <div>
                <h1 id="board-projects-title">{t("orchestra.board.title")}</h1>
                <p class="board-sub">{t("orchestra.board.description")}</p>
              </div>
              {needs()}
            </header>
            <Switch>
              <Match when={store.listFailed}>
                <div class="mx-empty">
                  <strong>{t("orchestra.board.listFailed")}</strong>
                  <button type="button" class="mx-btn" onClick={() => void loadList()}>
                    {t("orchestra.board.retry")}
                  </button>
                </div>
              </Match>
              <Match when={store.projects === undefined}>
                <p class="board-quiet board-loading">{t("orchestra.board.loading")}</p>
              </Match>
              <Match when={store.projects}>
                {(projects) => (
                  <Overview
                    projects={projects()}
                    onOpen={(key) => (setEpic(undefined), setView("board"), openProject(key))}
                    onChanged={() => void loadList()}
                  />
                )}
              </Match>
            </Switch>
          </section>
        )}
      >
        <section class="board-page" aria-labelledby="board-title">
          <nav class="board-crumb" aria-label={t("orchestra.board.crumb")}>
            <button type="button" class="mx-link" onClick={() => {
              if (protectSecret()) return
              setEpic(undefined)
              closeProject()
            }}>
              {t("orchestra.board.title")}
            </button>
            <span aria-hidden="true">/</span>
            <Show when={opened()} fallback={<span class="board-mono">{store.key}</span>}>
              {(open) => (
                <>
                  <button type="button" class="mx-link board-mono" onClick={() => openEpic(undefined)}>
                    {store.key}
                  </button>
                  <span aria-hidden="true">/</span>
                  <span>{open().epic.title}</span>
                </>
              )}
            </Show>
          </nav>
          <Switch>
            <Match when={store.boardFailed && !store.snapshot}>
              <div class="mx-empty">
                <strong>{t("orchestra.board.boardFailed")}</strong>
                <button type="button" class="mx-btn" onClick={() => store.key && loadBoard(store.key)}>
                  {t("orchestra.board.retry")}
                </button>
              </div>
            </Match>
            <Match when={!store.snapshot}>
              <p class="board-quiet board-loading">{t("orchestra.board.loading")}</p>
            </Match>
            <Match when={store.full && store.peek}>
              <div class="board-full" role="region" tabindex="-1" aria-labelledby="board-detail-title">
                <DetailState full />
              </div>
            </Match>
            <Match when={opened()}>
              {(open) => (
                <>
                  <EpicPage
                    snapshot={open().snapshot}
                    epic={open().epic}
                    focused={store.focused}
                    peek={store.peek}
                    onOpen={openPeek}
                    onEpic={openEpic}
                  />
                  <Show when={store.peek}>
                    <div class="board-scrim" aria-hidden="true" onClick={closePeek} />
                    <aside class="board-peek" role="dialog" aria-labelledby="board-detail-title">
                      <DetailState full={false} />
                    </aside>
                  </Show>
                </>
              )}
            </Match>
            <Match when={store.snapshot}>
              {(snapshot) => (
                <>
                  <header class="board-head">
                    <div>
                      <div class="board-eyebrow">
                        {snapshot().project.key}
                        <Show when={snapshot().project.targetDate}>
                          {(target) => <> · {t("orchestra.board.target", { date: date(target()) })}</>}
                        </Show>
                      </div>
                      <div class="board-title-row">
                        <h1 id="board-title">{snapshot().project.name}</h1>
                        <Show when={store.projects?.find((item) => item.project.id === snapshot().project.id)}>
                          {(summary) => (
                            <span class="board-health" data-health={summary().health}>
                              <MxBadge tone={summary().health === "on_track" ? "good" : undefined}>
                                {t(healthKey[summary().health])}
                              </MxBadge>
                            </span>
                          )}
                        </Show>
                      </div>
                      <div class="board-sub">
                        {t("orchestra.board.kept", { time: time(store.fetchedAt) })}
                        <span class="board-dot" aria-hidden="true" />
                        {t("orchestra.board.onlyMaestro")}
                      </div>
                    </div>
                    <div class="board-head-end">
                      {needs()}
                      <button type="button" class="mx-btn board-create" aria-expanded={store.creating} disabled={store.busy && store.creating} onClick={() => {
                        setStore({ creating: !store.creating, newRevision: store.newRevision + 1 })
                        queueMicrotask(() => root?.querySelector<HTMLInputElement>(".board-new-issue input")?.focus())
                      }}>{t("orchestra.board.workspace.create")}</button>
                      <ExtrasHeader extras={extras} t={t} />
                      <ViewSwitch view={view()} onChange={setView} />
                      <Show when={crew().length > 0}>
                        <div class="board-crew">
                          <span class="board-stack">
                            <For each={crew()}>{(seat) => <Seat seat={seat} />}</For>
                          </span>
                          {language.plural("orchestra.board.crew", crew().length)}
                        </div>
                      </Show>
                      <button type="button" class="mx-btn" disabled={store.busy} onClick={() => void toggleProject()}>
                        {snapshot().project.status === "paused"
                          ? t("orchestra.board.resume.project")
                          : t("orchestra.board.pause.project")}
                      </button>
                    </div>
                  </header>
                  <Show when={store.creating}>
                    <form class="board-new-issue" onSubmit={(event) => {
                      event.preventDefault()
                      if (!store.newTitle.trim()) return
                      const revision = store.newRevision
                      const title = store.newTitle.trim()
                      void write((key) => api().create({ key, title: store.newTitle.trim(), body: store.newBody }), "project").then((ok) => {
                        if (!ok) return
                        setStore("createdTitle", title)
                        if (store.newRevision !== revision) return
                        setStore({ creating: false, newTitle: "", newBody: "", createdTitle: title })
                        queueMicrotask(() => root?.querySelector<HTMLButtonElement>(".board-create")?.focus())
                      })
                    }}>
                      <label class="mx-field"><span>{t("orchestra.board.workspace.newTitle")}</span>
                        <input type="text" required value={store.newTitle} onInput={(event) => setStore({ newTitle: event.currentTarget.value, newRevision: store.newRevision + 1 })} />
                      </label>
                      <label class="mx-field"><span>{t("orchestra.board.workspace.newBody")}</span>
                        <textarea class="board-input" rows={3} value={store.newBody} onInput={(event) => setStore({ newBody: event.currentTarget.value, newRevision: store.newRevision + 1 })} />
                      </label>
                      <div class="board-add"><button class="mx-btn primary" type="submit" disabled={store.busy || !store.newTitle.trim()}>{t("orchestra.board.workspace.create")}</button>
                        <button class="mx-btn" type="button" disabled={store.busy} onClick={() => setStore({ creating: false, newRevision: store.newRevision + 1 })}>{t("orchestra.board.cancel")}</button></div>
                    </form>
                  </Show>
                  <Show when={store.createdTitle}>{(title) => <p class="board-quiet" role="status">{t("orchestra.board.workspace.created", { title: title() })}</p>}</Show>
                  <Show when={!store.peek && store.failure}>
                    {(failure) => (
                      <p class="mx-error" role="alert">
                        {failure()}
                      </p>
                    )}
                  </Show>

                  <Show when={view() === "list"}>
                    <ListView
                      snapshot={snapshot()}
                      focused={store.focused}
                      peek={store.peek}
                      onOpen={openPeek}
                      onEpic={openEpic}
                    />
                  </Show>
                  <Show when={view() === "timeline"}>
                    <Timeline snapshot={snapshot()} onOpen={openPeek} onEpic={openEpic} />
                  </Show>
                  <div class="board-top" hidden={view() !== "board"}>
                    <section class="board-brief" aria-label={t("orchestra.board.brief")}>
                      <Show when={snapshot().project.goal}>
                        <p>{snapshot().project.goal}</p>
                      </Show>
                      <Show when={snapshot().project.status === "paused"}>
                        <p class="board-held-note">
                          {snapshot().project.pausedReason
                            ? t("orchestra.board.projectPaused", { reason: snapshot().project.pausedReason ?? "" })
                            : t("orchestra.board.projectPausedPlain")}
                        </p>
                      </Show>
                      <div class="board-metric">
                        <span>
                          <b class="board-percent">{plan().percent}%</b>
                          {t("orchestra.board.shippedOf", { shipped: plan().shipped, total: plan().total })}
                        </span>
                        <span class="board-bar" aria-hidden="true">
                          <For each={plan().stages}>
                            {(item) => (
                              <Show when={item.count > 0}>
                                <i data-stage={item.stage} style={{ "flex-grow": item.count }} />
                              </Show>
                            )}
                          </For>
                        </span>
                        <span class="board-legend">
                          <For each={plan().stages}>
                            {(item) => (
                              <span data-stage={item.stage}>
                                <i aria-hidden="true" />
                                {t(stageKey[item.stage])} {item.count}
                              </span>
                            )}
                          </For>
                          <Show when={grouped().intake > 0}>
                            <span class="board-intake">{language.plural("orchestra.board.intake", grouped().intake)}</span>
                          </Show>
                        </span>
                        <replay.Since />
                      </div>
                    </section>
                    <Show when={questions()[0]}>
                      {(question) => {
                        const issue = () => snapshot().issues.find((item) => item.number === question().issue)
                        return (
                          <section class="board-ask" aria-labelledby="board-ask-text">
                            <div class="board-ask-kicker">
                              {t("orchestra.board.ask.title")}
                              <span>{t("orchestra.board.ask.position", { total: questions().length })}</span>
                            </div>
                            <p id="board-ask-text" class="board-ask-text">
                              {question().text}
                            </p>
                            <Show when={issue()}>
                              {(item) => (
                                <p class="board-quiet">
                                  {t("orchestra.board.ask.why", { title: item().title })}{" "}
                                  <span class="board-mono">{item().ref}</span>
                                </p>
                              )}
                            </Show>
                            <ul class="board-ask-options">
                              <For each={question().options}>
                                {(option, index) => (
                                  <li>
                                    <button
                                      type="button"
                                      class="board-option"
                                      data-recommended={option.id === question().recommended}
                                      disabled={store.busy}
                                      onClick={() => void answer(question(), option.id)}
                                    >
                                      <kbd>{index() + 1}</kbd>
                                      {option.label}
                                    </button>
                                  </li>
                                )}
                              </For>
                            </ul>
                          </section>
                        )
                      }}
                    </Show>
                  </div>

                  <Show when={view() === "board"}>
                    <Intake
                      snapshot={snapshot()}
                      busy={store.busy}
                      onAccept={(number) => void write((key) => api().accept({ key, number: String(number) }), "project", `${store.key}-${number}`)}
                      onDecline={(number) => void write((key) => api().decline({ key, number: String(number) }), "project", `${store.key}-${number}`)}
                    />
                    <replay.Bar />
                  </Show>
                  <div
                    class="board-grid"
                    hidden={view() !== "board"}
                    role="group"
                    aria-label={t("orchestra.board.grid")}
                    data-replay={replay.open()}
                  >
                    <For each={columns}>{(stage) => <Lane stage={stage} />}</For>
                  </div>
                  <Show when={store.boardFailed}>
                    <p class="board-quiet">{t("orchestra.board.stale")}</p>
                  </Show>

                  <Show when={store.peek}>
                    <div class="board-scrim" aria-hidden="true" onClick={closePeek} />
                    <aside class="board-peek" role="dialog" aria-labelledby="board-detail-title">
                      <DetailState full={false} />
                    </aside>
                  </Show>
                  <ExtrasPanels
                    extras={extras}
                    snapshot={snapshot()}
                    epicTitle={(number) => epics().get(number)}
                    onCard={openPeek}
                  />
                </>
              )}
            </Match>
          </Switch>
        </section>
      </Show>
    </div>
  )
}
