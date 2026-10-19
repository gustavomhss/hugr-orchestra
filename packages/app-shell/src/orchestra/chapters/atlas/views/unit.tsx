import { createEffect, createMemo, For, type JSX, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasFact, AtlasOwnPack } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Help, Icon, Seat } from "../kit/chips"
import { Acc, Btn, FactRow, Kpi, rememberOpen, Seven, Tech } from "../kit/controls"
import { num } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import { openAtlasSheet } from "../sheets/state"
import { BriefingBuild } from "./briefing-build"
import { UnitMap } from "./unit-map"
import type { AtlasViewProps } from "./index"

// A unit: what an agent learns here, and whether it still holds (specs/atlas-ui/mock/views.js:31-159). The same
// page shows a folder or a file inside a unit.
const STRUCTURE = [
  ["orchestra.atlas.unit.structure.links", "orchestra.atlas.unit.structure.links.help"],
  ["orchestra.atlas.unit.structure.never", "orchestra.atlas.unit.structure.never.help"],
  ["orchestra.atlas.unit.structure.changes", "orchestra.atlas.unit.structure.changes.help"],
  ["orchestra.atlas.unit.structure.hollow", "orchestra.atlas.unit.structure.hollow.help"],
] as const

export default function AtlasUnitView(props: AtlasViewProps) {
  const path = createMemo(() => props.route.param || props.model.units()[0]?.id || "(root)")
  return (
    <Show when={path()} keyed>
      {(current) => <UnitPage route={props.route} model={props.model} path={current} />}
    </Show>
  )
}

function UnitPage(props: AtlasViewProps & { path: string }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const path = props.path
  const isRoot = path === "(root)"
  const leaf = path.split("/").at(-1) ?? path
  const node = createMemo(() => props.model.findNode(isRoot ? "" : path))
  const isUnit = createMemo(() => props.model.units().some((unit) => unit.id === path))
  const unitId = createMemo(() => (props.model.unitOf(`${path}/x`) === path ? path : props.model.unitOf(path)))
  const b = createMemo(() =>
    isRoot
      ? { ...props.model.briefing(""), here: props.model.live().filter((x) => props.model.unitOf(x.file) === "(root)") }
      : props.model.briefing(path),
  )
  const here = () => b().here
  const fresh = () => here().filter((x) => props.model.state(x) === "fresh").length
  const territory = createMemo(() => props.model.territoryOf(unitId()))
  const strict = () => (here().some((x) => x.tier === "T0") ? "T0" : here().some((x) => x.tier === "T1") ? "T1" : "T2")
  const published = () => props.model.snapshot.units.includes(path)
  const snap = () => props.model.snapshot.packs[path] as AtlasOwnPack | undefined
  const sent = () => b().inv.length + b().gotchas.length + b().adv.length
  // A store in git serves only re-proven sealed facts, so `own` sends nothing from it.
  const blind = () => props.model.provenance() !== "trusted"
  const facts = (n: number) => language.plural("orchestra.atlas.unit.facts", n, { n: num(n) })
  const percent = (a: number, total: number) => (total ? Math.round((a / total) * 100) : 0)

  createEffect(() =>
    atlas.crumbs([
      language.t("orchestra.atlas.unit.crumb.knowledge"),
      ...(isUnit() ? [path] : [unitId(), path.slice(unitId().length + 1)]),
    ]),
  )

  // Facts by kind: the slot groups, then the facts with no slot.
  const groupId = (titleKey: string) => titleKey.slice(titleKey.lastIndexOf(".") + 1)
  const typeOf = (x: AtlasFact) => {
    const group = props.model.SLOT_GROUPS.find((item) => !!x.slot && (item[2] as readonly string[]).includes(x.slot))
    return group ? groupId(group[0]) : "unsorted"
  }
  const type = () => props.route.query.type ?? ""
  const kinds = createMemo(() =>
    [
      ...props.model.SLOT_GROUPS.map((group) => [groupId(group[0]), language.t(group[0])] as const),
      ["unsorted", language.t("orchestra.atlas.unit.kinds.unsorted")] as const,
    ]
      .map((kind) => ({ id: kind[0], label: kind[1], count: here().filter((x) => typeOf(x) === kind[0]).length }))
      .filter((kind) => kind.count > 0),
  )
  const shown = () => here().filter((x) => !type() || typeOf(x) === type())

  const usedFacts = createMemo(() =>
    props.model
      .live()
      .filter((x) => b().depFiles.includes(x.file))
      .sort((a, z) => a.key.localeCompare(z.key)),
  )
  const finer = createMemo(() => {
    const current = node()
    return current ? [...current.children.values()].sort((x, y) => x.path.localeCompare(y.path)) : []
  })
  const owner = () => props.model.packOwner(isRoot ? "" : unitId())

  const tech = (): (readonly [string, JSX.Element] | false)[] => [
    [
      language.t("orchestra.atlas.unit.tech.command"),
      <Rich text={language.t("orchestra.atlas.unit.tech.command.value", { path, leaf })} />,
    ],
    [language.t("orchestra.atlas.unit.tech.grounding"), language.t("orchestra.atlas.unit.tech.grounding.value")],
    [
      language.t("orchestra.atlas.unit.tech.owner"),
      owner().length ? owner().join(", ") : language.t("orchestra.atlas.unit.tech.owner.none"),
    ],
    [language.t("orchestra.atlas.unit.tech.strict"), strict()],
    [
      language.t("orchestra.atlas.unit.tech.tokens"),
      language.t("orchestra.atlas.unit.tech.tokens.value", { used: num(b().used), cap: num(b().cap) }),
    ],
    [language.t("orchestra.atlas.unit.tech.dropped"), String(b().pull.filter((x) => !props.model.governing(x)).length)],
    [
      language.t("orchestra.atlas.unit.tech.pointers"),
      b().pointers.length ? (
        <Rich text={language.t("orchestra.atlas.unit.tech.pointers.value", { count: b().pointers.length, total: b().pointerTotal })} />
      ) : (
        language.t("orchestra.atlas.unit.tech.pointers.none")
      ),
    ],
    [language.t("orchestra.atlas.unit.tech.refresh"), <Rich text={language.t("orchestra.atlas.unit.tech.refresh.value", { path, leaf })} />],
    [language.t("orchestra.atlas.unit.tech.query"), <Rich text={language.t("orchestra.atlas.unit.tech.query.value", { path })} />],
    [
      language.t("orchestra.atlas.unit.tech.anchors"),
      <Rich text={language.t("orchestra.atlas.unit.tech.anchors.value", { path, head: props.model.R.head })} />,
    ],
  ]

  return (
    <div class="at-page narrow">
      <div class="at-agent-head">
        <span class="at-avatar unit">
          <Icon name={node()?.file ? "fact" : "stack"} />
        </span>
        <div>
          <div class="mx-eyebrow">
            <Show
              when={isUnit()}
              fallback={
                <>
                  {language.t("orchestra.atlas.unit.inside")}{" "}
                  <AtlasLink class="mx-link" href={atlasHref("unit", unitId())}>
                    {unitId().split("/").slice(1).join("/") || unitId()}
                  </AtlasLink>
                </>
              }
            >
              {language.t("orchestra.atlas.unit.eyebrow", {
                group: path.includes("/") ? path.split("/")[0] : language.t("orchestra.atlas.unit.repoRoot"),
              })}
            </Show>
          </div>
          <h1 class="mono">{isUnit() ? path.split("/").slice(1).join("/") || path : path.split("/").slice(-2).join("/")}</h1>
          <p>
            <Show when={territory()} fallback={language.t("orchestra.atlas.unit.noTerritory")}>
              {(terr) => (
                <>
                  {terr().name} · <Seat id={terr().owner} />
                </>
              )}
            </Show>
          </p>
        </div>
        <span class="grow" />
        <Show when={!territory()}>
          <Btn
            label={language.t("orchestra.atlas.unit.declare")}
            onClick={() => openAtlasSheet({ kind: "territory", unit: unitId() })}
          />
        </Show>
        <Btn label={language.t("orchestra.atlas.unit.addFact")} icon="plus" write onClick={() => openAtlasSheet({ kind: "add-fact", path })} />
      </div>
      <div class="at-kpis">
        <Kpi
          label={language.t("orchestra.atlas.unit.kpi.facts")}
          value={num(here().length)}
          foot={language.t("orchestra.atlas.unit.kpi.ratified", { count: here().filter((x) => props.model.governing(x)).length })}
        />
        <Kpi
          label={language.t("orchestra.atlas.unit.kpi.fresh")}
          value={language.t("orchestra.atlas.unit.kpi.percent", { value: percent(fresh(), here().length) })}
          foot={
            here().length - fresh()
              ? language.t("orchestra.atlas.unit.kpi.changed", { count: here().length - fresh() })
              : language.t("orchestra.atlas.unit.kpi.unchanged")
          }
          tone={here().length - fresh() ? "warn" : undefined}
        />
        <Kpi
          label={language.t("orchestra.atlas.unit.kpi.briefing")}
          value={num(blind() || isRoot ? 0 : sent())}
          foot={
            blind()
              ? language.t("orchestra.atlas.unit.kpi.blind")
              : language.t("orchestra.atlas.unit.kpi.used", { used: num(b().used) })
          }
        />
        <Kpi
          label={language.t("orchestra.atlas.unit.kpi.depends")}
          value={num(b().depFactsTotal)}
          foot={language.t(b().depFactsTotal ? "orchestra.atlas.unit.kpi.elsewhere" : "orchestra.atlas.unit.kpi.outside")}
        />
      </div>
      <Acc
        id="unit-brief"
        icon="stack"
        title={language.t("orchestra.atlas.unit.brief")}
        purpose={language.t("orchestra.atlas.unit.brief.purpose")}
        summary={facts(sent())}
        open
      >
        <Show when={!isRoot} fallback={<div class="at-band-empty">{language.t("orchestra.atlas.unit.brief.root")}</div>}>
          <Show
            when={published()}
            fallback={
              <div class="at-snapline">
                <Icon name="info" />
                <span>{language.t("orchestra.atlas.unit.unpublished")}</span>
                <Btn label={language.t("orchestra.atlas.unit.publish")} cap="R7" onClick={() => openAtlasSheet({ kind: "republish" })} />
              </div>
            }
          >
            <div class="at-snapline good">
              <Icon name="checkc" />
              <span>
                <Show when={snap()} fallback={language.t("orchestra.atlas.unit.published")}>
                  {(pack) =>
                    language.t("orchestra.atlas.unit.publishedCounts", {
                      ratified: language.plural("orchestra.atlas.unit.ratifiedFacts", pack().invariants.length, {
                        n: num(pack().invariants.length),
                      }),
                      hints: pack().advisory,
                    })
                  }
                </Show>
              </span>
              <Help text={language.t("orchestra.atlas.unit.published.help", { revision: props.model.snapshot.revision })} />
              <Btn label={language.t("orchestra.atlas.unit.republish")} cap="R7" onClick={() => openAtlasSheet({ kind: "republish" })} />
            </div>
          </Show>
          <Show when={blind()}>
            <div class="ins-note">
              <Icon name="lock" />
              <span>{language.t("orchestra.atlas.unit.blind")}</span>
            </div>
          </Show>
          <Band
            tone="gov"
            title={language.t("orchestra.atlas.unit.band.gov")}
            help={language.t("orchestra.atlas.unit.band.gov.help")}
            list={b().inv}
            empty={language.t("orchestra.atlas.unit.band.gov.empty")}
          />
          <Show when={b().gotchas.length}>
            <Band
              tone="gotcha"
              title={language.t("orchestra.atlas.unit.band.gotcha")}
              help={language.t("orchestra.atlas.unit.band.gotcha.help")}
              list={b().gotchas}
              empty=""
            />
          </Show>
          <Show when={b().pointers.length}>
            <section class="at-band">
              <header class="at-band-head">
                <h3>{language.t("orchestra.atlas.unit.band.deeper")}</h3>
                <Help text={language.t("orchestra.atlas.unit.band.deeper.help")} />
                <span class="wf-count">{b().pointers.length}</span>
              </header>
              <For each={b().pointers}>
                {(pointer) => (
                  <AtlasLink class="at-linkrow" href={atlasHref("unit", pointer.path)}>
                    <Icon name="folder" />
                    <code class="at-mono">{pointer.path.slice(path.length + 1) || pointer.name}</code>
                  </AtlasLink>
                )}
              </For>
            </section>
          </Show>
          <Band
            tone="adv"
            title={language.t("orchestra.atlas.unit.band.adv")}
            help={language.t("orchestra.atlas.unit.band.adv.help")}
            list={b().adv}
            empty={language.t("orchestra.atlas.unit.band.adv.empty")}
          />
          <Show when={b().pull.length}>
            <details class="at-sub-acc" ref={rememberOpen(`pull-${path}`)}>
              <summary>
                <Icon name="chev" />
                <span>{language.t("orchestra.atlas.unit.band.pull")}</span>
                <span class="wf-count">{b().pull.length}</span>
              </summary>
              <Seven id="pull" rows={b().pull}>
                {(x) => <FactRow fact={x} short />}
              </Seven>
            </details>
          </Show>
        </Show>
      </Acc>
      <Show when={!isRoot}>
        <Acc
          id="unit-build"
          icon="play"
          title={language.t("orchestra.atlas.unit.build")}
          purpose={language.t("orchestra.atlas.unit.build.purpose")}
          summary={language.t("orchestra.atlas.unit.build.summary", { used: num(b().used) })}
        >
          <BriefingBuild path={path} />
        </Acc>
      </Show>
      <Show when={!isRoot && !node()?.file}>
        <Acc
          id="unit-map"
          icon="graph"
          title={language.t("orchestra.atlas.unit.map")}
          purpose={language.t("orchestra.atlas.unit.map.purpose")}
          summary={language.t("orchestra.atlas.unit.map.files", { count: props.model.fileGraph(path).files.length })}
        >
          <UnitMap model={props.model} path={path} />
        </Acc>
      </Show>
      <Acc
        id="unit-kinds"
        icon="fact"
        title={language.t("orchestra.atlas.unit.kinds")}
        purpose={language.t("orchestra.atlas.unit.kinds.purpose")}
        summary={String(here().length)}
      >
        <div class="at-acc-tools">
          <div class="at-typechips">
            <For each={[{ id: "", label: language.t("orchestra.atlas.unit.kinds.all"), count: here().length }, ...kinds()]}>
              {(kind) => (
                <button
                  type="button"
                  class={`at-typechip ${type() === kind.id ? "on" : ""}`}
                  onClick={() => atlas.go(atlasHref("unit", path, { type: kind.id }))}
                >
                  {kind.label}
                  <span>{kind.count}</span>
                </button>
              )}
            </For>
          </div>
          <Help text={language.t("orchestra.atlas.unit.kinds.help")} />
        </div>
        <Seven id={`kind${type()}`} rows={shown()}>
          {(x) => <FactRow fact={x} short />}
        </Seven>
      </Acc>
      <Acc
        id="unit-structure"
        icon="relations"
        title={language.t("orchestra.atlas.unit.structure")}
        purpose={language.t("orchestra.atlas.unit.structure.purpose")}
        summary={language.t("orchestra.atlas.unit.structure.none")}
      >
        <For each={STRUCTURE}>
          {(item) => (
            <div class="at-struct">
              <div class="at-struct-head">
                <strong>{language.t(item[0])}</strong>
                <Help text={language.t(item[1])} />
                <span class="wf-count">0</span>
              </div>
              <div class="at-band-empty">{language.t("orchestra.atlas.unit.structure.empty")}</div>
            </div>
          )}
        </For>
        <p class="at-stew-intro">
          <Rich text={language.t("orchestra.atlas.unit.structure.producers")} />
        </p>
      </Acc>
      <Acc
        id="unit-conn"
        icon="graph"
        title={language.t("orchestra.atlas.unit.conn")}
        purpose={language.t("orchestra.atlas.unit.conn.purpose")}
        summary={String(usedFacts().length)}
      >
        <div class="at-acc-tools">
          <strong class="at-acc-label">{language.t("orchestra.atlas.unit.conn.usedBy")}</strong>
          <Help text={language.t("orchestra.atlas.unit.conn.usedBy.help")} />
        </div>
        <Show when={usedFacts().length} fallback={<div class="at-band-empty">{language.t("orchestra.atlas.unit.conn.none")}</div>}>
          <Seven id="used" rows={usedFacts()}>
            {(x) => <FactRow fact={x} />}
          </Seven>
        </Show>
        <div class="at-linkrow static muted">
          <Icon name="minusc" />
          <span>{language.t("orchestra.atlas.unit.conn.uses")}</span>
          <Help text={language.t("orchestra.atlas.unit.conn.uses.help")} />
          <span class="grow" />
          <small>{language.t("orchestra.atlas.unit.conn.notRecorded")}</small>
        </div>
      </Acc>
      <Acc
        id="unit-finer"
        icon="folder"
        title={language.t("orchestra.atlas.unit.finer")}
        purpose={language.t("orchestra.atlas.unit.finer.purpose")}
        summary={String(finer().length)}
      >
        <Show when={finer().length} fallback={<div class="at-band-empty">{language.t("orchestra.atlas.unit.finer.none")}</div>}>
          <Seven id="finer" rows={finer()}>
            {(child) => (
              <AtlasLink class="at-linkrow" href={atlasHref("unit", child.path)}>
                <Icon name={child.file ? "fact" : "folder"} />
                <code class="at-mono">{child.name}</code>
                <span class="grow" />
                <Show when={child.drifted}>
                  <span class="at-sdot warm" />
                </Show>
                <small>{facts(child.facts)}</small>
              </AtlasLink>
            )}
          </Seven>
        </Show>
      </Acc>
      <Tech rows={tech()} />
    </div>
  )
}

// One briefing band: its title, help, count and fact rows (views.js:49).
function Band(props: { tone: string; title: string; help: string; list: AtlasFact[]; empty: string }) {
  return (
    <section class={`at-band ${props.tone}`}>
      <header class="at-band-head">
        <h3>{props.title}</h3>
        <Help text={props.help} />
        <span class="wf-count">{props.list.length}</span>
      </header>
      <Show when={props.list.length} fallback={<div class="at-band-empty">{props.empty}</div>}>
        <For each={props.list}>{(x) => <FactRow fact={x} short />}</For>
      </Show>
    </section>
  )
}
