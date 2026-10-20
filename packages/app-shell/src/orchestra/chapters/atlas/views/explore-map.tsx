import type { HierarchyRectangularNode } from "d3-hierarchy"
import { createEffect, createMemo, For, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasFact, AtlasModel, AtlasUnit } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Btn } from "../kit/controls"
import { num } from "../kit/format"
import { packTree, type PackNode, SWEEP_TONES, sweepIndex } from "./explore-pack"
import { shortUnit } from "./explore-units"

// The map (specs/atlas-ui/mock/views-explore.js:197-282): rings pick the scope, bars rank what is inside it, dots
// show its facts one by one. Colour says where, not health: health is the thin outer band, sand for the share of
// facts whose code moved. d3-hierarchy and d3-shape load only when the map mounts (D11).
type MapNode = HierarchyRectangularNode<PackNode>
type Slice = { node: MapNode; a0: number; a1: number; depth: 1 | 2; ri: number; ro: number; hue: string }

const SIZE = 600
const RADIUS = SIZE / 2
const RING = RADIUS / 3.6
const RADII = { 1: [RING + 4, RING * 2.05], 2: [RING * 2.05 + 5, RING * 2.85] } as const

export function ExploreMap(props: { model: AtlasModel; units: AtlasUnit[] }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const [state, setState] = createStore({ ready: false, failed: false, focus: 0, mark: -1, run: 0 })
  // The partition and the arc generators of the current load. Not reactive: `state.run` changes when they do.
  const lib = {
    nodes: [] as MapNode[],
    index: new Map<MapNode, number>(),
    drifted: new Map<MapNode, number>(),
    slicePath: (_slice: Slice) => "",
    driftPath: (_start: number, _end: number) => "",
  }

  createEffect(
    on(
      () => [props.units, props.model] as const,
      async () => {
        const run = state.run + 1
        setState({ run, ready: false })
        const libs = await Promise.all([import("d3-hierarchy"), import("d3-shape")]).catch(() => undefined)
        if (run !== state.run) return
        if (!libs) return setState("failed", true)
        const hierarchy = libs[0]
        const shape = libs[1]
        const tree = packTree(
          props.model,
          props.units.map((unit) => unit.id),
          (id) => shortUnit(id, language.t("orchestra.atlas.explore.topLevel")),
        )
        const root = hierarchy.partition<PackNode>().size([2 * Math.PI, 4])(
          hierarchy
            .hierarchy(tree)
            .sum((d) => (d.leaf ? d.facts : 0))
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
        )
        const nodes = root.descendants()
        const arc = shape
          .arc<Slice>()
          .startAngle((d) => d.a0)
          .endAngle((d) => d.a1)
          .padAngle(0.012)
          .padRadius(RADIUS * 0.6)
          .cornerRadius(5)
          .innerRadius((d) => d.ri)
          .outerRadius((d) => d.ro)
        const drift = shape
          .arc<{ start: number; end: number }>()
          .startAngle((d) => d.start)
          .endAngle((d) => d.end)
          .innerRadius(RING * 2.85 + 9)
          .outerRadius(RING * 2.85 + 15)
          .cornerRadius(3)
        lib.nodes = nodes
        lib.index = new Map(nodes.map((d, i) => [d, i]))
        lib.drifted = new Map(
          nodes.map((d) => [d, d.data.leaf ? d.data.drifted : d.leaves().reduce((n, l) => n + l.data.drifted, 0)]),
        )
        lib.slicePath = (slice) => arc(slice) ?? ""
        lib.driftPath = (start, end) => drift({ start, end }) ?? ""
        setState({ ready: true, failed: false, focus: 0, mark: -1 })
      },
    ),
  )

  const changed = (d: MapNode) => lib.drifted.get(d) ?? 0
  const value = (d: MapNode) => d.value ?? 0
  const facts = (n: number) => language.plural("orchestra.atlas.explore.facts", n, { n: num(n) })
  const clip = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name)
  const marked = () => (state.mark >= 0 ? lib.nodes[state.mark] : undefined)
  const focusOn = (d: MapNode | null | undefined) => d && setState({ focus: lib.index.get(d) ?? 0, mark: -1 })
  const mark = (d: MapNode | undefined) => setState("mark", d ? (lib.index.get(d) ?? -1) : -1)
  const go = (d: MapNode) => (d.data.leaf ? atlas.go(atlasHref("unit", d.data.path)) : focusOn(d))
  const tip = (d: MapNode) =>
    language.t(changed(d) ? "orchestra.atlas.explore.map.tipChanged" : "orchestra.atlas.explore.map.tip", {
      path: d.data.path || language.t("orchestra.atlas.explore.map.everything"),
      facts: facts(value(d)),
      changed: num(changed(d)),
    })

  // Rings: the focus in the middle, its children, then theirs. Each child of the focus takes one of five tones in
  // turn; its own children reuse it, lighter (the CSS on .d2).
  const view = createMemo(() => {
    if (!state.ready) return undefined
    const root = lib.nodes[0]
    const focus = lib.nodes[state.focus] ?? root
    const span = focus.x1 - focus.x0
    const ring = [...(focus.children ?? [])].sort((a, b) => a.x0 - b.x0)
    const sweep = new Map(ring.map((c, n) => [c, SWEEP_TONES[sweepIndex(n, ring.length)]]))
    const slices = focus
      .descendants()
      .filter((d) => d !== focus && d.depth - focus.depth <= 2)
      .map((d): Slice => {
        const depth = d.depth - focus.depth === 1 ? 1 : 2
        const top = depth === 1 ? d : d.parent
        return {
          node: d,
          a0: ((d.x0 - focus.x0) / span) * 2 * Math.PI,
          a1: ((d.x1 - focus.x0) / span) * 2 * Math.PI,
          depth,
          ri: RADII[depth][0],
          ro: RADII[depth][1],
          hue: (top && sweep.get(top)) ?? SWEEP_TONES[0],
        }
      })
      .filter((s) => s.a1 - s.a0 > (s.depth === 1 ? 0.01 : 0.02))
    const kids = [...(focus.children ?? [])].sort((a, b) => value(b) - value(a))
    const live = props.model.live()
    const scoped = (d: MapNode) =>
      live.filter(
        (x) =>
          x.file === d.data.path ||
          x.file.startsWith(`${d.data.path}/`) ||
          (d.data.unit === "(root)" && props.model.unitOf(x.file) === "(root)"),
      )
    const groups: (readonly [MapNode, AtlasFact[]])[] =
      focus === root
        ? kids.map((d) => [d, live.filter((x) => props.model.unitOf(x.file) === d.data.unit)] as const)
        : kids.length
          ? kids.map((d) => [d, scoped(d)] as const)
          : [[focus, scoped(focus)] as const]
    return { root, focus, slices, sweep, kids, groups, max: kids.length ? value(kids[0]) : 1 }
  })

  const centre = () => {
    const current = view()
    if (!current) return undefined
    const d = marked() ?? current.focus
    return {
      label: d === current.root ? language.t("orchestra.atlas.explore.map.allFacts") : clip(d.data.name),
      value: num(value(d)),
      changed: changed(d),
    }
  }

  return (
    <div class="at-map" classList={{ marking: state.mark >= 0 }}>
      <Show when={!state.failed} fallback={<div class="at-band-empty">{language.t("orchestra.atlas.explore.map.offline")}</div>}>
        <Show when={view()}>
          {(current) => (
            <>
              <div class="at-map-rings">
                <svg viewBox={`${-RADIUS} ${-RADIUS} ${SIZE} ${SIZE}`} role="img" aria-label={language.t("orchestra.atlas.explore.map.aria")}>
                  <circle class="at-map-track" r={RING * 2.85 + 12} />
                  <For each={current().slices.filter((s) => s.depth === 1 && changed(s.node))}>
                    {(s) => (
                      <path
                        class="at-map-drift"
                        d={lib.driftPath(
                          s.a0 + 0.006,
                          s.a0 + 0.006 + Math.max(0.02, (s.a1 - s.a0 - 0.012) * (changed(s.node) / value(s.node))),
                        )}
                      >
                        <title>
                          {language.t("orchestra.atlas.explore.map.drift", {
                            name: s.node.data.name,
                            changed: num(changed(s.node)),
                            total: num(value(s.node)),
                          })}
                        </title>
                      </path>
                    )}
                  </For>
                  <For each={current().slices}>
                    {(s) => (
                      <path
                        class={`at-map-arc d${s.depth}`}
                        classList={{ on: !!marked() && (s.node === marked() || s.node.parent === marked()) }}
                        d={lib.slicePath(s)}
                        style={{ fill: s.hue, "animation-delay": `${Math.round((s.a0 / (2 * Math.PI)) * 260)}ms` }}
                        onClick={() => go(s.node)}
                        onMouseEnter={() => mark(s.node)}
                        onMouseLeave={() => mark(undefined)}
                      >
                        <title>{tip(s.node)}</title>
                      </path>
                    )}
                  </For>
                  <circle
                    class={`at-map-centre ${current().focus === current().root ? "" : "up"}`}
                    r={RING - 4}
                    onClick={() => focusOn(current().focus.parent)}
                  >
                    <title>
                      {language.t(current().focus === current().root ? "orchestra.atlas.explore.map.root" : "orchestra.atlas.explore.map.up")}
                    </title>
                  </circle>
                  <text class="at-map-centre-k" y="-30">
                    {centre()?.label}
                  </text>
                  <text class="at-map-centre-n" y="14">
                    {centre()?.value}
                  </text>
                  <text class="at-map-centre-u" classList={{ warm: !!centre()?.changed }} y="44">
                    {centre()?.changed
                      ? language.t("orchestra.atlas.explore.map.changed", { count: num(centre()?.changed ?? 0) })
                      : language.t("orchestra.atlas.explore.map.allHold")}
                  </text>
                  <Show when={current().focus !== current().root}>
                    <text class="at-map-centre-back" y="72">
                      {language.t("orchestra.atlas.explore.map.back")}
                    </text>
                  </Show>
                </svg>
                <div class="at-map-hint">{language.t("orchestra.atlas.explore.map.hint")}</div>
              </div>
              <div class="at-map-side">
                <div class="at-pack-crumbs">
                  <button type="button" onClick={() => focusOn(current().root)}>
                    {language.t("orchestra.atlas.explore.map.all")}
                  </button>
                  <For each={current().focus.ancestors().reverse().slice(1)}>
                    {(a) => (
                      <>
                        <span>/</span>
                        <button type="button" onClick={() => focusOn(a)}>
                          {a.data.name}
                        </button>
                      </>
                    )}
                  </For>
                </div>
                <div class="at-map-title">
                  <strong>
                    {current().focus === current().root ? language.t("orchestra.atlas.explore.map.root") : current().focus.data.path}
                  </strong>
                  <div class="at-pack-stats">
                    <div>
                      <b>{num(value(current().focus))}</b>
                      <small>{language.t("orchestra.atlas.explore.map.stat.facts")}</small>
                    </div>
                    <div>
                      <b classList={{ warm: !!changed(current().focus) }}>{num(changed(current().focus))}</b>
                      <small>{language.t("orchestra.atlas.explore.map.stat.changed")}</small>
                    </div>
                    <div>
                      <b>
                        {value(current().focus)
                          ? Math.round(((value(current().focus) - changed(current().focus)) / value(current().focus)) * 100)
                          : 0}
                        %
                      </b>
                      <small>{language.t("orchestra.atlas.explore.map.stat.hold")}</small>
                    </div>
                  </div>
                  <Show when={current().focus !== current().root}>
                    <Btn
                      label={language.t(current().focus.depth === 1 ? "orchestra.atlas.explore.map.openUnit" : "orchestra.atlas.explore.map.open")}
                      onClick={() => atlas.go(atlasHref("unit", current().focus.data.path))}
                    />
                  </Show>
                </div>
                <div class="at-map-bars">
                  <div class="at-map-bars-k">
                    <span>{language.t("orchestra.atlas.explore.map.inside")}</span>
                    <span>{language.t("orchestra.atlas.explore.map.insideColumns")}</span>
                  </div>
                  <For each={current().kids.slice(0, 14)}>
                    {(d) => (
                      <button
                        type="button"
                        class="at-map-bar"
                        onClick={() => go(d)}
                        onMouseEnter={() => mark(d)}
                        onMouseLeave={() => mark(undefined)}
                      >
                        <span class="n">
                          <i class="at-map-sw" style={{ background: current().sweep.get(d) ?? "var(--mx-dim)" }} />
                          {d.data.name}
                        </span>
                        <span class="track">
                          <i class="hold" style={{ width: `${((value(d) - changed(d)) / current().max) * 100}%` }} />
                          <i class="much" style={{ width: `${(changed(d) / current().max) * 100}%` }} />
                        </span>
                        <span class="v">
                          {num(value(d))}
                          <Show when={changed(d)}>
                            <small>{Math.round((changed(d) / value(d)) * 100)}%</small>
                          </Show>
                        </span>
                      </button>
                    )}
                  </For>
                  <Show when={current().kids.length > 14}>
                    <p class="muted">{language.t("orchestra.atlas.explore.map.more", { count: current().kids.length - 14 })}</p>
                  </Show>
                </div>
              </div>
              <div class="at-map-dots">
                <div class="at-map-dots-head">
                  <b>{language.t("orchestra.atlas.explore.map.dots", { count: num(value(current().focus)) })}</b>
                  <span class="grow" />
                  <span class="at-map-key">
                    <i class="hold" />
                    {language.t("orchestra.atlas.explore.map.key.hold")}
                  </span>
                  <span class="at-map-key">
                    <i class="some" />
                    {language.t("orchestra.atlas.explore.map.key.some")}
                  </span>
                  <span class="at-map-key">
                    <i class="much" />
                    {language.t("orchestra.atlas.explore.map.key.much")}
                  </span>
                </div>
                <div class="at-map-dotgrid">
                  <For each={current().groups}>
                    {(group) => (
                      <div class="at-map-dotgroup" classList={{ on: !!marked() && marked()?.data.path === group[0].data.path }}>
                        <small>
                          {group[0].data.name}
                          <span>{group[1].length}</span>
                        </small>
                        <div>
                          <For each={group[1]}>
                            {(x) => (
                              <a
                                class="at-dot"
                                classList={{ moved: props.model.state(x) === "drifted" }}
                                href={atlasHref("fact", x.key)}
                                title={x.claim.slice(0, 160)}
                                onClick={(event) => {
                                  event.preventDefault()
                                  atlas.go(atlasHref("fact", x.key))
                                }}
                              />
                            )}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </>
          )}
        </Show>
      </Show>
    </div>
  )
}
