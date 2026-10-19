import { createMemo, For, type JSX, Match, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import type { AtlasModel } from "../atlas-model"
import { Help, Icon } from "../kit/chips"
import { rememberOpen, Tech } from "../kit/controls"
import { num } from "../kit/format"
import { Rich } from "../kit/text"

// Health lives on Home (specs/atlas-ui/mock/views-more.js:126-150): six checks, one dot each. The section stays
// closed while every check is fine and opens on its own, with the failing row open, when one needs attention.
// Grey is a real gap, not a problem. Every number comes from the store's own files (model.health()).

const ACCESS = {
  trusted: ["good", "orchestra.atlas.overview.health.access.trusted"],
  "tracked-provable": ["warm", "orchestra.atlas.overview.health.access.tracked-provable"],
  "tracked-staging": ["bad", "orchestra.atlas.overview.health.access.tracked-staging"],
} as const
const LANGS = {
  ts: "orchestra.atlas.overview.health.lang.ts",
  py: "orchestra.atlas.overview.health.lang.py",
  go: "orchestra.atlas.overview.health.lang.go",
  java: "orchestra.atlas.overview.health.lang.java",
  rust: "orchestra.atlas.overview.health.lang.rust",
  rb: "orchestra.atlas.overview.health.lang.rb",
} as const
type HealthRow = { id: "access" | "cas" | "proofs" | "index" | "memory" | "scanner"; tone: string; title: string; line: string }

export function HealthSection(props: { model: AtlasModel; open: boolean }) {
  const language = useLanguage()
  const health = createMemo(() => props.model.health())
  const langName = (lang: string) => (lang in LANGS ? language.t(LANGS[lang as keyof typeof LANGS]) : lang)
  const rows = createMemo((): HealthRow[] => {
    const h = health()
    return [
      {
        id: "access",
        tone: ACCESS[h.provenance][0],
        title: language.t("orchestra.atlas.overview.health.access"),
        line: language.t(ACCESS[h.provenance][1]),
      },
      {
        id: "cas",
        tone: h.cas.sound ? "good" : "bad",
        title: language.t("orchestra.atlas.overview.health.cas"),
        line: language.t(h.cas.sound ? "orchestra.atlas.overview.health.cas.sound" : "orchestra.atlas.overview.health.cas.unsound", {
          count: num(h.cas.objects),
        }),
      },
      {
        id: "proofs",
        tone: "good",
        title: language.t("orchestra.atlas.overview.health.proofs"),
        line: h.proofs.sealedProven
          ? language.t("orchestra.atlas.overview.health.proofs.line", { reProven: h.proofs.reProven, proven: h.proofs.sealedProven })
          : language.t("orchestra.atlas.overview.health.proofs.none"),
      },
      {
        id: "index",
        tone: h.index.scip ? "good" : "",
        title: language.t("orchestra.atlas.overview.health.index"),
        line: h.index.scip
          ? language.t("orchestra.atlas.overview.health.index.present", {
              langs: h.index.configured
                .map((c) => language.t("orchestra.atlas.overview.health.index.lang", { count: num(c.files), lang: langName(c.lang) }))
                .join(", "),
            })
          : language.t("orchestra.atlas.overview.health.index.none"),
      },
      {
        id: "memory",
        tone: "good",
        title: language.t("orchestra.atlas.overview.health.memory"),
        line: language.t("orchestra.atlas.overview.health.memory.line"),
      },
      {
        id: "scanner",
        tone: "",
        title: language.t("orchestra.atlas.overview.health.scanner"),
        line: language.t("orchestra.atlas.overview.health.scanner.line"),
      },
    ]
  })
  const bad = () => rows().filter((row) => row.tone === "warm" || row.tone === "bad")
  const summary = () => {
    const failing = bad()
    if (failing.length === 1) return language.t("orchestra.atlas.overview.health.attentionOne", { title: failing[0].title })
    if (failing.length > 1) return language.t("orchestra.atlas.overview.health.attentionMany", { count: failing.length })
    return language.t("orchestra.atlas.overview.health.pass", { count: rows().length })
  }
  const kv = (items: readonly (readonly [string, JSX.Element])[]) => (
    <dl class="at-kv wide">
      <For each={items}>
        {(item) => (
          <>
            <dt>{item[0]}</dt>
            <dd>{item[1]}</dd>
          </>
        )}
      </For>
    </dl>
  )
  const tracked = () =>
    [
      props.model.R.tracked.projection ? language.t("orchestra.atlas.overview.health.access.projection") : "",
      props.model.R.tracked.cas
        ? language.t("orchestra.atlas.overview.health.access.objects", { count: num(props.model.R.tracked.cas) })
        : "",
      props.model.R.tracked.policy ? language.t("orchestra.atlas.overview.health.access.policy") : "",
    ]
      .filter(Boolean)
      .join(", ") || language.t("orchestra.atlas.overview.health.access.nothing")
  const command = () => language.t("orchestra.atlas.overview.health.command")
  const body = (id: HealthRow["id"]) => (
    <Switch>
      <Match when={id === "access"}>
        {kv([
          [language.t("orchestra.atlas.overview.health.access.tracked"), tracked()],
          [
            language.t("orchestra.atlas.overview.health.access.proven"),
            language.t("orchestra.atlas.overview.health.access.provenValue", {
              proven: health().proofs.sealedProven,
              total: num(props.model.facts.length),
            }),
          ],
        ])}
        <p class="mx-note">
          <Rich
            text={language.t(
              health().provenance === "trusted"
                ? "orchestra.atlas.overview.health.access.noteTrusted"
                : "orchestra.atlas.overview.health.access.noteTracked",
            )}
          />
        </p>
      </Match>
      <Match when={id === "cas"}>
        {kv([
          [language.t("orchestra.atlas.overview.health.cas.used"), num(health().cas.referenced)],
          [language.t("orchestra.atlas.overview.health.cas.missing"), String(health().cas.missing)],
          [language.t("orchestra.atlas.overview.health.cas.corrupt"), `${health().cas.corrupt} · ${health().cas.unreadable}`],
          [
            language.t("orchestra.atlas.overview.health.cas.unused"),
            <>
              {num(health().cas.orphan)} <Help text={language.t("orchestra.atlas.overview.health.cas.unused.help")} />
            </>,
          ],
        ])}
        <Tech rows={[[command(), <code>atlas doctor cas</code>]]} />
      </Match>
      <Match when={id === "proofs"}>
        {kv([
          [language.t("orchestra.atlas.overview.health.proofs.proven"), String(health().proofs.sealedProven)],
          [
            language.t("orchestra.atlas.overview.health.proofs.replay"),
            `${health().proofs.reProven} · ${health().proofs.broken} · ${health().proofs.unverifiable} · ${health().proofs.dangling}`,
          ],
        ])}
        <Tech rows={[[command(), <Rich text={language.t("orchestra.atlas.overview.health.proofs.command")} />]]} />
      </Match>
      <Match when={id === "index"}>
        <For each={health().index.configured}>
          {(c) => (
            <div class="at-linkrow static">
              <Icon name="checkc" />
              <span>{language.t("orchestra.atlas.overview.health.index.files", { lang: langName(c.lang), count: num(c.files) })}</span>
              <span class="grow" />
              <small>
                {c.tool} {c.version}
              </small>
            </div>
          )}
        </For>
        <For each={health().index.holes}>
          {(c) => (
            <div class="at-linkrow static">
              <Icon name="minusc" />
              <span>{language.t("orchestra.atlas.overview.health.index.files", { lang: langName(c.lang), count: num(c.files) })}</span>
              <span class="grow" />
              <small>{language.t("orchestra.atlas.overview.health.index.noIndexer")}</small>
            </div>
          )}
        </For>
        <Tech
          rows={[
            [command(), <code>atlas doctor index</code>],
            [
              language.t("orchestra.atlas.overview.health.index.rebuild"),
              <Rich text={language.t("orchestra.atlas.overview.health.index.rebuild.text")} />,
            ],
          ]}
        />
      </Match>
      <Match when={id === "memory"}>
        {kv([
          [
            language.t("orchestra.atlas.overview.health.memory.store"),
            <Rich text={language.t("orchestra.atlas.overview.health.memory.store.text")} />,
          ],
          [
            language.t("orchestra.atlas.overview.health.memory.state"),
            <>
              {language.t("orchestra.atlas.overview.health.memory.complete")}{" "}
              <Help text={language.t("orchestra.atlas.overview.health.memory.complete.help")} />
            </>,
          ],
        ])}
      </Match>
      <Match when={id === "scanner"}>
        <p class="at-stew-intro">{language.t("orchestra.atlas.overview.health.scanner.intro")}</p>
        <Tech
          rows={[
            [language.t("orchestra.atlas.overview.health.scanner.source"), language.t("orchestra.atlas.overview.health.scanner.source.text")],
            [
              language.t("orchestra.atlas.overview.health.scanner.refusals"),
              <>
                <code>scanner-unavailable</code> · <code>scanner-blocked</code>
              </>,
            ],
            [language.t("orchestra.atlas.overview.health.scanner.facts"), language.t("orchestra.atlas.overview.health.scanner.facts.text")],
          ]}
        />
      </Match>
    </Switch>
  )
  return (
    <details class="at-acc at-health" id="health" open={bad().length > 0 || props.open}>
      <summary>
        <span class="at-acc-ic">
          <Icon name="health" />
        </span>
        <span class="at-acc-t">
          <strong>{language.t("orchestra.atlas.overview.health.title")}</strong>
          <small>{summary()}</small>
        </span>
        <span class="at-acc-sum at-health-dots">
          <For each={rows()}>{(row) => <span class={`at-sdot ${row.tone}`} data-tip={row.title} />}</For>
        </span>
        <Icon name="chev" class="at-acc-chev" />
      </summary>
      <div class="at-acc-body">
        <For each={rows()}>
          {(row) => (
            <details class="at-sub-acc at-hrow" ref={rememberOpen(`health-${row.id}`, row.tone === "warm" || row.tone === "bad")}>
              <summary>
                <Icon name="chev" />
                <span class={`at-sdot ${row.tone}`} />
                <span>
                  <b>{row.title}</b> <small>{row.line}</small>
                </span>
              </summary>
              <div class="at-hrow-body">{body(row.id)}</div>
            </details>
          )}
        </For>
      </div>
    </details>
  )
}