import { For, Match, onCleanup, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { AtlasModel } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Icon } from "../kit/chips"
import { Btn } from "../kit/controls"
import { num } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import { archChapter } from "./architecture-data"

// The Overview chapter's one picture (specs/atlas-ui/mock/views-arch.js:16-48, 185-208): what comes in, the door,
// the store, what goes out. A click on a box explains it; Play walks a write or a read through the boxes.
const BOX = {
  code: {
    zone: "in",
    icon: "code",
    title: "orchestra.atlas.architecture.box.code.title",
    what: "orchestra.atlas.architecture.box.code.what",
    term: "orchestra.atlas.architecture.box.code.term",
    go: "identity",
  },
  index: {
    zone: "in",
    icon: "graph",
    title: "orchestra.atlas.architecture.box.index.title",
    what: "orchestra.atlas.architecture.box.index.what",
    term: "orchestra.atlas.architecture.box.index.term",
    go: "store",
  },
  author: {
    zone: "in",
    icon: "agents",
    title: "orchestra.atlas.architecture.box.author.title",
    what: "orchestra.atlas.architecture.box.author.what",
    term: "orchestra.atlas.architecture.box.author.term",
    go: "write",
  },
  door: {
    zone: "door",
    icon: "shield",
    title: "orchestra.atlas.architecture.box.door.title",
    what: "orchestra.atlas.architecture.box.door.what",
    term: "orchestra.atlas.architecture.box.door.term",
    go: "write",
  },
  facts: {
    zone: "store",
    icon: "fact",
    title: "orchestra.atlas.architecture.box.facts.title",
    what: "orchestra.atlas.architecture.box.facts.what",
    term: "orchestra.atlas.architecture.box.facts.term",
    go: "store",
  },
  current: {
    zone: "store",
    icon: "stack",
    title: "orchestra.atlas.architecture.box.current.title",
    what: "orchestra.atlas.architecture.box.current.what",
    term: "orchestra.atlas.architecture.box.current.term",
    go: "store",
  },
  waiting: {
    zone: "store",
    icon: "inbox",
    title: "orchestra.atlas.architecture.box.waiting.title",
    what: "orchestra.atlas.architecture.box.waiting.what",
    term: "orchestra.atlas.architecture.box.waiting.term",
    go: "store",
  },
  check: {
    zone: "out",
    icon: "drift",
    title: "orchestra.atlas.architecture.box.check.title",
    what: "orchestra.atlas.architecture.box.check.what",
    term: "orchestra.atlas.architecture.box.check.term",
    go: "read",
  },
  brief: {
    zone: "out",
    icon: "agents",
    title: "orchestra.atlas.architecture.box.brief.title",
    what: "orchestra.atlas.architecture.box.brief.what",
    term: "orchestra.atlas.architecture.box.brief.term",
    go: "read",
  },
  export: {
    zone: "out",
    icon: "download",
    title: "orchestra.atlas.architecture.box.export.title",
    what: "orchestra.atlas.architecture.box.export.what",
    term: "orchestra.atlas.architecture.box.export.term",
    go: "portable",
  },
} as const
type ArchBoxId = keyof typeof BOX
// The sub-line of the boxes that show no count; facts, current and waiting count from the snapshot.
const SUB = {
  code: "orchestra.atlas.architecture.box.code.sub",
  index: "orchestra.atlas.architecture.box.index.sub",
  author: "orchestra.atlas.architecture.box.author.sub",
  door: "orchestra.atlas.architecture.box.door.sub",
  check: "orchestra.atlas.architecture.box.check.sub",
  brief: "orchestra.atlas.architecture.box.brief.sub",
  export: "orchestra.atlas.architecture.box.export.sub",
} as const
// Each step lights one box and says one sentence (views-arch.js:29-32).
const PLAY = {
  write: [
    ["author", "orchestra.atlas.architecture.play.write.1"],
    ["door", "orchestra.atlas.architecture.play.write.2"],
    ["code", "orchestra.atlas.architecture.play.write.3"],
    ["facts", "orchestra.atlas.architecture.play.write.4"],
    ["current", "orchestra.atlas.architecture.play.write.5"],
  ],
  read: [
    ["brief", "orchestra.atlas.architecture.play.read.1"],
    ["current", "orchestra.atlas.architecture.play.read.2"],
    ["facts", "orchestra.atlas.architecture.play.read.3"],
    ["check", "orchestra.atlas.architecture.play.read.4"],
    ["brief", "orchestra.atlas.architecture.play.read.5"],
  ],
} as const
type ArchPlayKind = keyof typeof PLAY
const GATES = [
  "orchestra.atlas.architecture.gate.shape",
  "orchestra.atlas.architecture.gate.truth",
  "orchestra.atlas.architecture.gate.authz",
  "orchestra.atlas.architecture.gate.ratify",
] as const
const WOW = [
  {
    icon: "hash",
    title: "orchestra.atlas.architecture.wow.hash.title",
    text: "orchestra.atlas.architecture.wow.hash.text",
    ch: "identity",
  },
  {
    icon: "drift",
    title: "orchestra.atlas.architecture.wow.drift.title",
    text: "orchestra.atlas.architecture.wow.drift.text",
    ch: "identity",
  },
  {
    icon: "shield",
    title: "orchestra.atlas.architecture.wow.truth.title",
    text: "orchestra.atlas.architecture.wow.truth.text",
    ch: "read",
  },
  {
    icon: "stack",
    title: "orchestra.atlas.architecture.wow.db.title",
    text: "orchestra.atlas.architecture.wow.db.text",
    ch: "write",
  },
] as const

export function ArchOverview(props: { model: AtlasModel }) {
  const language = useLanguage()
  const [state, setState] = createStore<{
    selected?: ArchBoxId
    lit?: ArchBoxId
    done: ArchBoxId[]
    caption: "hint" | "box" | "step" | "final"
    kind: ArchPlayKind
    index: number
  }>({ done: [], caption: "hint", kind: "write", index: 0 })
  const timer: { id?: ReturnType<typeof setInterval> } = {}
  const stop = () => clearInterval(timer.id)
  onCleanup(stop)

  const sub = (id: ArchBoxId) => {
    const R = props.model.R
    const waiting = R.candidates.length + props.model.facts.length
    if (id === "facts")
      return language.plural("orchestra.atlas.architecture.box.facts.sub", R.casObjects, { n: num(R.casObjects) })
    if (id === "current")
      return language.plural("orchestra.atlas.architecture.box.current.sub", props.model.facts.length, {
        gen: R.gen,
        n: num(props.model.facts.length),
      })
    if (id === "waiting")
      return language.plural("orchestra.atlas.architecture.box.waiting.sub", waiting, { n: num(waiting) })
    return language.t(SUB[id])
  }
  const term = (id: ArchBoxId) =>
    language.t(BOX[id].term, { gen: props.model.R.gen, stagingGen: props.model.R.stagingGen })

  // The mock's A.archPlay: light the next box every 1.5 s; the box lit before turns "done".
  const play = (kind: ArchPlayKind) => {
    stop()
    setState({ selected: undefined, lit: undefined, done: [], caption: "hint", kind, index: -1 })
    const tick = () => {
      const index = state.index + 1
      const lit = state.lit
      const done = lit ? [...state.done, lit] : [...state.done]
      if (index >= PLAY[kind].length) {
        stop()
        setState({ lit: undefined, done, caption: "final" })
        return
      }
      setState({ lit: PLAY[kind][index][0], done, index, caption: "step" })
    }
    tick()
    timer.id = setInterval(tick, 1500)
  }

  const Box = (box: { id: ArchBoxId }) => (
    <button
      type="button"
      class={`at-ax-box ${BOX[box.id].zone}`}
      classList={{ sel: state.selected === box.id, lit: state.lit === box.id, done: state.done.includes(box.id) }}
      onClick={() => setState({ selected: box.id, caption: "box" })}
    >
      <span class="at-ax-ic">
        <Icon name={BOX[box.id].icon} />
      </span>
      <span>
        <b>{language.t(BOX[box.id].title)}</b>
        <small>{sub(box.id)}</small>
      </span>
    </button>
  )

  return (
    <>
      <div class="at-ch-intro">
        <p>{language.t("orchestra.atlas.architecture.overview.intro")}</p>
        <div>
          <Btn
            label={language.t("orchestra.atlas.architecture.play.write")}
            primary
            icon="play"
            onClick={() => play("write")}
          />
          <Btn label={language.t("orchestra.atlas.architecture.play.read")} icon="play" onClick={() => play("read")} />
        </div>
      </div>
      <section class="at-ax">
        <div class="at-ax-col">
          <div class="at-ax-label">{language.t("orchestra.atlas.architecture.col.in")}</div>
          <Box id="code" />
          <Box id="index" />
          <Box id="author" />
        </div>
        <div class="at-ax-arrow">
          <Icon name="arrow" />
        </div>
        <div class="at-ax-col narrow">
          <div class="at-ax-label">{language.t("orchestra.atlas.architecture.col.door")}</div>
          <Box id="door" />
          <div class="at-ax-gates">
            <For each={GATES}>
              {(gate, n) => (
                <span>
                  <i>{n() + 1}</i>
                  {language.t(gate)}
                </span>
              )}
            </For>
          </div>
        </div>
        <div class="at-ax-arrow">
          <Icon name="arrow" />
        </div>
        <div class="at-ax-col store">
          <div class="at-ax-label">
            <Rich text={language.t("orchestra.atlas.architecture.col.store")} />
          </div>
          <Box id="facts" />
          <Box id="current" />
          <Box id="waiting" />
        </div>
        <div class="at-ax-arrow">
          <Icon name="arrow" />
        </div>
        <div class="at-ax-col">
          <div class="at-ax-label">{language.t("orchestra.atlas.architecture.col.out")}</div>
          <Box id="check" />
          <Box id="brief" />
          <Box id="export" />
        </div>
      </section>
      <div class="at-ax-caption">
        <Switch fallback={<span class="muted">{language.t("orchestra.atlas.architecture.caption.hint")}</span>}>
          <Match when={state.caption === "box" && state.selected}>
            {(id) => (
              <>
                <b>{language.t(BOX[id()].title)}</b>
                <span>{language.t(BOX[id()].what)}</span>
                <code>{term(id())}</code>
                <AtlasLink class="mx-link" href={atlasHref("architecture", "", { ch: BOX[id()].go })}>
                  {language.t("orchestra.atlas.architecture.caption.more", {
                    chapter: language.t(archChapter(BOX[id()].go)[1]),
                  })}
                  <Icon name="arrow" />
                </AtlasLink>
              </>
            )}
          </Match>
          <Match when={state.caption === "step"}>
            <>
              <b>
                {language.t("orchestra.atlas.architecture.play.count", {
                  i: state.index + 1,
                  n: PLAY[state.kind].length,
                })}
              </b>
              <span>{language.t(PLAY[state.kind][state.index][1])}</span>
            </>
          </Match>
          <Match when={state.caption === "final"}>
            <>
              <b>
                {language.t(
                  state.kind === "write"
                    ? "orchestra.atlas.architecture.play.write.done"
                    : "orchestra.atlas.architecture.play.read.done",
                )}
              </b>
              <span>
                {language.t(
                  state.kind === "write"
                    ? "orchestra.atlas.architecture.play.write.done.text"
                    : "orchestra.atlas.architecture.play.read.done.text",
                )}
              </span>
              <AtlasLink class="mx-link" href={atlasHref("architecture", "", { ch: state.kind })}>
                {language.t("orchestra.atlas.architecture.play.slow")}
                <Icon name="arrow" />
              </AtlasLink>
            </>
          </Match>
        </Switch>
      </div>
      <div class="at-wow">
        <For each={WOW}>
          {(card) => (
            <AtlasLink class="at-wow-card" href={atlasHref("architecture", "", { ch: card.ch })}>
              <span>
                <Icon name={card.icon} />
              </span>
              <b>{language.t(card.title)}</b>
              <p>{language.t(card.text)}</p>
              <small>
                {language.t("orchestra.atlas.architecture.wow.more")}
                <Icon name="arrow" />
              </small>
            </AtlasLink>
          )}
        </For>
      </div>
    </>
  )
}
