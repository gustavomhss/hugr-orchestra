import { For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasModel } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Btn } from "../kit/controls"
import { num } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import { KeepSection } from "./overview-keep"
import { TravelSection } from "./overview-travel"

// The Write and Read chapters walk one write or one read step by step; the Store chapter lists every file in
// .atlas/ (specs/atlas-ui/mock/views-arch.js:50-95). `text` is a step's main paragraph; the steps that show more
// add their blocks by id in ArchSteps.
const WRITE = [
  {
    id: "claim",
    title: "orchestra.atlas.architecture.write.claim.title",
    who: "orchestra.atlas.architecture.who.cli",
    text: "orchestra.atlas.architecture.write.claim.text",
  },
  {
    id: "handler",
    title: "orchestra.atlas.architecture.write.handler.title",
    who: "orchestra.atlas.architecture.who.tools",
    text: "orchestra.atlas.architecture.write.handler.text",
  },
  {
    id: "checks",
    title: "orchestra.atlas.architecture.write.checks.title",
    who: "orchestra.atlas.architecture.who.adapter-io",
    text: "orchestra.atlas.architecture.write.checks.text",
  },
  {
    id: "route",
    title: "orchestra.atlas.architecture.write.route.title",
    who: "orchestra.atlas.architecture.who.knowledge",
    text: "orchestra.atlas.architecture.write.route.text",
  },
  {
    id: "hash",
    title: "orchestra.atlas.architecture.write.hash.title",
    who: "orchestra.atlas.architecture.who.kernel",
    text: "orchestra.atlas.architecture.write.hash.text",
  },
  {
    id: "publish",
    title: "orchestra.atlas.architecture.write.publish.title",
    who: "orchestra.atlas.architecture.who.disk",
    text: "orchestra.atlas.architecture.write.publish.text",
  },
] as const
const READ = [
  {
    id: "question",
    title: "orchestra.atlas.architecture.read.question.title",
    who: "orchestra.atlas.architecture.who.cli",
    text: "orchestra.atlas.architecture.read.question.text",
  },
  {
    id: "trust",
    title: "orchestra.atlas.architecture.read.trust.title",
    who: "orchestra.atlas.architecture.who.adapter-io",
    text: undefined,
  },
  {
    id: "rehash",
    title: "orchestra.atlas.architecture.read.rehash.title",
    who: "orchestra.atlas.architecture.who.kernel",
    text: "orchestra.atlas.architecture.read.rehash.text",
  },
  {
    id: "still",
    title: "orchestra.atlas.architecture.read.still.title",
    who: "orchestra.atlas.architecture.who.grounding",
    text: "orchestra.atlas.architecture.read.still.text",
  },
  {
    id: "pack",
    title: "orchestra.atlas.architecture.read.pack.title",
    who: "orchestra.atlas.architecture.who.retrieval",
    text: "orchestra.atlas.architecture.read.pack.text",
  },
  {
    id: "edges",
    title: "orchestra.atlas.architecture.read.edges.title",
    who: "orchestra.atlas.architecture.who.knowledge",
    text: "orchestra.atlas.architecture.read.edges.text",
  },
] as const
type ArchStep = (typeof WRITE)[number] | (typeof READ)[number]
// The door's four checks and their sixteen gates (views-arch.js:54). `code` is the Atlas check name.
const GATES = [
  {
    name: "orchestra.atlas.architecture.gate.shape",
    code: "shape",
    items: [
      "orchestra.atlas.architecture.gate.shape.1",
      "orchestra.atlas.architecture.gate.shape.2",
      "orchestra.atlas.architecture.gate.shape.3",
      "orchestra.atlas.architecture.gate.shape.4",
    ],
  },
  {
    name: "orchestra.atlas.architecture.gate.truth",
    code: "truth",
    items: ["orchestra.atlas.architecture.gate.truth.1", "orchestra.atlas.architecture.gate.truth.2"],
  },
  {
    name: "orchestra.atlas.architecture.gate.authz",
    code: "authz",
    items: [
      "orchestra.atlas.architecture.gate.authz.1",
      "orchestra.atlas.architecture.gate.authz.2",
      "orchestra.atlas.architecture.gate.authz.3",
    ],
  },
  {
    name: "orchestra.atlas.architecture.gate.ratify",
    code: "ratify",
    items: [
      "orchestra.atlas.architecture.gate.ratify.1",
      "orchestra.atlas.architecture.gate.ratify.2",
      "orchestra.atlas.architecture.gate.ratify.3",
    ],
  },
] as const
// The router's four outcomes (views-arch.js:55). `code` is the Atlas route name.
const ROUTES = [
  { word: "orchestra.atlas.architecture.route.dedup", code: "DEDUP", text: "orchestra.atlas.architecture.route.dedup.text" },
  { word: "orchestra.atlas.architecture.route.create", code: "CREATE", text: "orchestra.atlas.architecture.route.create.text" },
  { word: "orchestra.atlas.architecture.route.update", code: "UPDATE", text: "orchestra.atlas.architecture.route.update.text" },
  {
    word: "orchestra.atlas.architecture.route.supersede",
    code: "SUPERSEDE",
    text: "orchestra.atlas.architecture.route.supersede.text",
  },
] as const
// The three store provenances (views-arch.js:62). `code` is the value model.provenance() returns.
const TRUST = [
  { word: "orchestra.atlas.architecture.trust.trusted", code: "trusted", text: "orchestra.atlas.architecture.trust.trusted.text" },
  {
    word: "orchestra.atlas.architecture.trust.provable",
    code: "tracked-provable",
    text: "orchestra.atlas.architecture.trust.provable.text",
  },
  {
    word: "orchestra.atlas.architecture.trust.staging",
    code: "tracked-staging",
    text: "orchestra.atlas.architecture.trust.staging.text",
  },
] as const

export function ArchSteps(props: { model: AtlasModel; kind: "write" | "read"; step: number }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const list = (): readonly ArchStep[] => (props.kind === "write" ? WRITE : READ)
  const index = () => Math.min(Math.max(0, Math.trunc(props.step) || 0), list().length - 1)
  const step = () => list()[index()]
  const href = (n: number) => atlasHref("architecture", "", { ch: props.kind, step: String(n) })
  return (
    <div class="at-steps2">
      <ol>
        <For each={list()}>
          {(item, n) => (
            <li classList={{ on: n() === index(), done: n() < index() }}>
              <AtlasLink href={href(n())}>
                <span>{n() + 1}</span>
                <b>{language.t(item.title)}</b>
                <code>{language.t(item.who)}</code>
              </AtlasLink>
            </li>
          )}
        </For>
      </ol>
      <div class="at-steps2-body">
        <div class="mx-eyebrow">
          {language.t("orchestra.atlas.architecture.steps.eyebrow", {
            i: index() + 1,
            n: list().length,
            who: language.t(step().who),
          })}
        </div>
        <h3>{language.t(step().title)}</h3>
        <Show when={step().text}>
          {(key) => (
            <p>
              <Rich text={language.t(key(), { gen: props.model.R.gen + 1 })} />
              <Show when={step().id === "pack"}>
                {" "}
                <AtlasLink class="mx-link" href={atlasHref("how", "", { step: "3" })}>
                  {language.t("orchestra.atlas.architecture.read.pack.link")}
                </AtlasLink>
              </Show>
            </p>
          )}
        </Show>
        <Switch>
          <Match when={step().id === "checks"}>
            <div class="at-gates4">
              <For each={GATES}>
                {(gate, n) => (
                  <div class="at-gate4">
                    <span>{n() + 1}</span>
                    <b>{language.t(gate.name)}</b>
                    <code>{gate.code}</code>
                    <ul>
                      <For each={gate.items}>{(item) => <li>{language.t(item)}</li>}</For>
                    </ul>
                  </div>
                )}
              </For>
            </div>
          </Match>
          <Match when={step().id === "route"}>
            <>
              <div class="at-routes">
                <For each={ROUTES}>
                  {(route) => (
                    <div>
                      <b>{language.t(route.word)}</b>
                      <code>{route.code}</code>
                      <p>{language.t(route.text)}</p>
                    </div>
                  )}
                </For>
              </div>
              <p class="muted">
                <Rich text={language.t("orchestra.atlas.architecture.write.route.note")} />
              </p>
            </>
          </Match>
          <Match when={step().id === "trust"}>
            <>
              <div class="at-routes three">
                <For each={TRUST}>
                  {(row) => (
                    <div>
                      <b>{language.t(row.word)}</b>
                      <code>{row.code}</code>
                      <p>{language.t(row.text)}</p>
                    </div>
                  )}
                </For>
              </div>
              <p class="muted">
                <Rich
                  text={language.t("orchestra.atlas.architecture.read.trust.note", {
                    provenance: props.model.provenance(),
                  })}
                />
              </p>
            </>
          </Match>
        </Switch>
        <div class="at-how-nav">
          <Show when={index() > 0} fallback={<span />}>
            <Btn
              label={language.t("orchestra.atlas.architecture.steps.back")}
              icon="back"
              onClick={() => atlas.go(href(index() - 1))}
            />
          </Show>
          <Show
            when={index() < list().length - 1}
            fallback={
              <Btn
                label={language.t(
                  props.kind === "write"
                    ? "orchestra.atlas.architecture.steps.toRead"
                    : "orchestra.atlas.architecture.steps.toOverview",
                )}
                primary
                icon="arrow"
                onClick={() =>
                  atlas.go(props.kind === "write" ? atlasHref("architecture", "", { ch: "read" }) : atlasHref("architecture"))
                }
              />
            }
          >
            <Btn
              label={language.t("orchestra.atlas.architecture.steps.next", {
                step: language.t(list()[index() + 1].title),
              })}
              primary
              icon="arrow"
              onClick={() => atlas.go(href(index() + 1))}
            />
          </Show>
        </div>
      </div>
    </div>
  )
}

// Every file under .atlas/ (views-arch.js:77-85): its copy, and whether it travels in git.
const GIT = {
  git: "orchestra.atlas.architecture.git.git",
  never: "orchestra.atlas.architecture.git.never",
  local: "orchestra.atlas.architecture.git.local",
} as const
const FILE_COPY = {
  cas: {
    what: "orchestra.atlas.architecture.file.cas.what",
    writer: "orchestra.atlas.architecture.file.cas.writer",
    reader: "orchestra.atlas.architecture.file.cas.reader",
    shape: "orchestra.atlas.architecture.file.cas.shape",
  },
  projection: {
    what: "orchestra.atlas.architecture.file.projection.what",
    writer: "orchestra.atlas.architecture.file.projection.writer",
    reader: "orchestra.atlas.architecture.file.projection.reader",
    shape: "orchestra.atlas.architecture.file.projection.shape",
  },
  staging: {
    what: "orchestra.atlas.architecture.file.staging.what",
    writer: "orchestra.atlas.architecture.file.staging.writer",
    reader: "orchestra.atlas.architecture.file.staging.reader",
    shape: "orchestra.atlas.architecture.file.staging.shape",
  },
  policy: {
    what: "orchestra.atlas.architecture.file.policy.what",
    writer: "orchestra.atlas.architecture.file.policy.writer",
    reader: "orchestra.atlas.architecture.file.policy.reader",
    shape: "orchestra.atlas.architecture.file.policy.shape",
  },
  index: {
    what: "orchestra.atlas.architecture.file.index.what",
    writer: "orchestra.atlas.architecture.file.index.writer",
    reader: "orchestra.atlas.architecture.file.index.reader",
    shape: "orchestra.atlas.architecture.file.index.shape",
  },
  memory: {
    what: "orchestra.atlas.architecture.file.memory.what",
    writer: "orchestra.atlas.architecture.file.memory.writer",
    reader: "orchestra.atlas.architecture.file.memory.reader",
    shape: "orchestra.atlas.architecture.file.memory.shape",
  },
  orientation: {
    what: "orchestra.atlas.architecture.file.orientation.what",
    writer: "orchestra.atlas.architecture.file.orientation.writer",
    reader: "orchestra.atlas.architecture.file.orientation.reader",
    shape: "orchestra.atlas.architecture.file.orientation.shape",
  },
} as const
type ArchFile = {
  name: string
  // Only computed sizes are shown; files with no computed size show none.
  size?: string
  git: keyof typeof GIT
  copy: (typeof FILE_COPY)[keyof typeof FILE_COPY]
}

export function ArchStore(props: { model: AtlasModel; file?: string }) {
  const language = useLanguage()
  const files = (): ArchFile[] => {
    const R = props.model.R
    const rows = (n: number) => language.plural("orchestra.atlas.architecture.file.size.rows", n, { n: num(n) })
    return [
      {
        name: "cas/",
        size: language.plural("orchestra.atlas.architecture.file.size.objects", R.casObjects, { n: num(R.casObjects) }),
        git: "local",
        copy: FILE_COPY.cas,
      },
      { name: `projection.${R.gen}.json`, size: rows(props.model.facts.length), git: "local", copy: FILE_COPY.projection },
      {
        name: `staging.${R.stagingGen}.json`,
        size: rows(R.candidates.length + props.model.facts.length),
        git: "never",
        copy: FILE_COPY.staging,
      },
      { name: "policy.json", git: "git", copy: FILE_COPY.policy },
      {
        name: "index.scip",
        size: language.t(
          R.scip ? "orchestra.atlas.architecture.file.size.present" : "orchestra.atlas.architecture.file.size.missing",
        ),
        git: "local",
        copy: FILE_COPY.index,
      },
      { name: "memory.jsonl", git: "git", copy: FILE_COPY.memory },
      { name: "orientation.jsonl", git: "git", copy: FILE_COPY.orientation },
    ]
  }
  const selected = () => files().find((item) => item.name === props.file) ?? files()[0]
  return (
    <>
      <div class="at-ch-intro">
        <p>
          <Rich text={language.t("orchestra.atlas.architecture.store.intro")} />
        </p>
      </div>
      <div class="at-store2">
        <div class="at-store2-list">
          <For each={files()}>
            {(item) => (
              <AtlasLink
                class={item.name === selected().name ? "at-disk-file sel" : "at-disk-file"}
                href={atlasHref("architecture", "", { ch: "store", file: item.name })}
              >
                <code>{item.name}</code>
                <Show when={item.size}>{(size) => <small>{size()}</small>}</Show>
                <span class={`at-disk-git ${item.git}`}>{language.t(GIT[item.git])}</span>
              </AtlasLink>
            )}
          </For>
        </div>
        <div class="at-store2-detail">
          <h3>
            <code>{selected().name}</code>
          </h3>
          <p>{language.t(selected().copy.what)}</p>
          <dl class="at-kv wide">
            <Show when={selected().size}>
              {(size) => (
                <>
                  <dt>{language.t("orchestra.atlas.architecture.file.size")}</dt>
                  <dd>{size()}</dd>
                </>
              )}
            </Show>
            <dt>{language.t("orchestra.atlas.architecture.file.writer")}</dt>
            <dd>{language.t(selected().copy.writer)}</dd>
            <dt>{language.t("orchestra.atlas.architecture.file.reader")}</dt>
            <dd>{language.t(selected().copy.reader)}</dd>
            <dt>{language.t("orchestra.atlas.architecture.file.shape")}</dt>
            <dd>
              <code>{language.t(selected().copy.shape)}</code>
            </dd>
          </dl>
          <Show when={props.model.provenance() !== "trusted"}>
            <p class="muted">{language.t("orchestra.atlas.architecture.store.note")}</p>
          </Show>
        </div>
      </div>
      <TravelSection />
      <KeepSection />
    </>
  )
}
