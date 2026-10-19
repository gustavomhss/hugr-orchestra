import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasModel } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Icon } from "../kit/chips"
import { Btn, Tech } from "../kit/controls"
import { hash, num } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import { ARCH_LAYER_ROWS, ARCH_RING, type ArchLayer, archLayerLinks, archSampleFact } from "./architecture-data"

// The Identity, Packages and Portable chapters (specs/atlas-ui/mock/views-arch.js:97-163).

// The code-tree demo: depth, name, and whether the name sits on the path from codec.ts to the top (views-arch.js:99-102).
const TREE = [
  [0, "repo", true],
  [1, "packages", true],
  [2, "kernel", true],
  [3, "codec.ts", true],
  [3, "store.ts", false],
  [2, "index", false],
  [3, "build.ts", false],
  [1, "docs", false],
] as const
// The six fact families: the word, the Atlas family code (its tooltip), the identity formula, what it says.
const FAMILIES = [
  {
    word: "orchestra.atlas.architecture.family.stated",
    code: "advisory",
    identity: "hash(anchor ‖ kind)",
    text: "orchestra.atlas.architecture.family.stated.text",
  },
  {
    word: "orchestra.atlas.architecture.family.tested",
    code: "predicate",
    identity: "hash(anchor ‖ check ‖ kind)",
    text: "orchestra.atlas.architecture.family.tested.text",
  },
  {
    word: "orchestra.atlas.architecture.family.link",
    code: "relation",
    identity: "hash(A ‖ depends-on ‖ B)",
    text: "orchestra.atlas.architecture.family.link.text",
  },
  {
    word: "orchestra.atlas.architecture.family.never",
    code: "negation",
    identity: "hash(target ‖ scope)",
    text: "orchestra.atlas.architecture.family.never.text",
  },
  {
    word: "orchestra.atlas.architecture.family.change",
    code: "transition",
    identity: "hash(unit ‖ before ‖ after)",
    text: "orchestra.atlas.architecture.family.change.text",
  },
  {
    word: "orchestra.atlas.architecture.family.hollow",
    code: "test-vacuity",
    identity: "hash(unit ‖ test)",
    text: "orchestra.atlas.architecture.family.hollow.text",
  },
] as const
const RULES = [
  ["orchestra.atlas.architecture.rule.all", "orchestra.atlas.architecture.rule.all.text"],
  ["orchestra.atlas.architecture.rule.empty", "orchestra.atlas.architecture.rule.empty.text"],
  ["orchestra.atlas.architecture.rule.inert", "orchestra.atlas.architecture.rule.inert.text"],
  ["orchestra.atlas.architecture.rule.roundtrip", "orchestra.atlas.architecture.rule.roundtrip.text"],
  ["orchestra.atlas.architecture.rule.stable", "orchestra.atlas.architecture.rule.stable.text"],
  ["orchestra.atlas.architecture.rule.memory", "orchestra.atlas.architecture.rule.memory.text"],
] as const

export function ArchIdentity(props: { model: AtlasModel }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const sample = () => archSampleFact(props.model)
  const [state, setState] = createStore({ text: archSampleFact(props.model)?.claim.slice(0, 80) ?? "", edited: false })
  return (
    <>
      <div class="at-ch-intro">
        <p>{language.t("orchestra.atlas.architecture.identity.intro")}</p>
        <Show when={sample()}>
          {(x) => (
            <Btn
              label={language.t("orchestra.atlas.architecture.identity.open")}
              onClick={() => atlas.go(atlasHref("fact", x().key))}
            />
          )}
        </Show>
      </div>
      <Show when={sample()}>
        {(x) => (
          <>
            <div class="at-how-fact">
              <span>
                <Icon name="fact" />
              </span>
              <p>{language.t("orchestra.atlas.architecture.identity.quote", { claim: x().claim })}</p>
              <code class="at-mono">{x().file}</code>
            </div>
            <div class="at-ids">
              <div class="at-id">
                <span>{language.t("orchestra.atlas.architecture.identity.content.q")}</span>
                <b>contentHash</b>
                <code>{`${x().hash.slice(0, 24)}…`}</code>
                <p>{language.t("orchestra.atlas.architecture.identity.content.text")}</p>
              </div>
              <div class="at-id">
                <span>{language.t("orchestra.atlas.architecture.identity.node.q")}</span>
                <b>nodeKey</b>
                <code>{`${x().key.slice(0, 24)}…`}</code>
                <p>{language.t("orchestra.atlas.architecture.identity.node.text")}</p>
              </div>
              <div class="at-id">
                <span>{language.t("orchestra.atlas.architecture.identity.subtree.q")}</span>
                <b>subtreeHash</b>
                <code>{x().subtree}</code>
                <p>
                  {language.t("orchestra.atlas.architecture.identity.subtree.text", {
                    file: x().file.split("/").at(-1) ?? "",
                    commit: x().derivedAt,
                  })}
                </p>
              </div>
            </div>
          </>
        )}
      </Show>
      <div class="at-outside">
        <Icon name="info" />
        <span>
          <Rich text={language.t("orchestra.atlas.architecture.identity.outside")} />
        </span>
      </div>
      <div class="at-ideas two">
        <div class="at-idea">
          <h3>{language.t("orchestra.atlas.architecture.identity.name.title")}</h3>
          <p>{language.t("orchestra.atlas.architecture.identity.name.text")}</p>
          <label class="mx-field">
            <span>{language.t("orchestra.atlas.architecture.identity.tryIt")}</span>
            <input value={state.text} onInput={(event) => setState("text", event.currentTarget.value)} />
          </label>
          <div class="at-idea-out">
            <small>{language.t("orchestra.atlas.architecture.identity.itsName")}</small>
            <code>{hash(state.text)}</code>
          </div>
          <small class="muted">{language.t("orchestra.atlas.architecture.identity.illustrative")}</small>
        </div>
        <div class="at-idea">
          <h3>{language.t("orchestra.atlas.architecture.identity.tree.title")}</h3>
          <p>{language.t("orchestra.atlas.architecture.identity.tree.text")}</p>
          <div class="at-tree">
            <For each={TREE}>
              {(row) => (
                <div
                  class="at-tree-row"
                  classList={{ hot: row[2] && state.edited }}
                  style={{ "padding-inline-start": `${row[0] * 16}px` }}
                >
                  <Icon name={row[1].includes(".") ? "fact" : "folder"} />
                  <span>{row[1]}</span>
                  <code>{row[2] && state.edited ? "9f2c…" : "a41e…"}</code>
                </div>
              )}
            </For>
            <Show when={state.edited}>
              <p class="at-tree-note">
                <Icon name="drift" />
                {language.t("orchestra.atlas.architecture.identity.tree.note")}
              </p>
            </Show>
          </div>
          <Btn
            label={language.t("orchestra.atlas.architecture.identity.tree.edit")}
            icon="code"
            onClick={() => setState("edited", (on) => !on)}
          />
        </div>
      </div>
      <h3 class="at-ax-h3">{language.t("orchestra.atlas.architecture.identity.families")}</h3>
      <table class="at-grid at-fam">
        <thead>
          <tr>
            <th>{language.t("orchestra.atlas.architecture.identity.head.family")}</th>
            <th>{language.t("orchestra.atlas.architecture.identity.head.identity")}</th>
            <th>{language.t("orchestra.atlas.architecture.identity.head.what")}</th>
          </tr>
        </thead>
        <tbody>
          <For each={FAMILIES}>
            {(row) => (
              <tr>
                <th>
                  <span data-tip={row.code}>{language.t(row.word)}</span>
                </th>
                <td>
                  <code>{row.identity}</code>
                </td>
                <td>{language.t(row.text)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <p class="muted">
        <Rich text={language.t("orchestra.atlas.architecture.identity.stamp")} />
      </p>
    </>
  )
}

export function ArchPackages(props: { pkg?: string }) {
  const language = useLanguage()
  const links = () => archLayerLinks(props.pkg)
  const ring = () => links().selected.level === "ring"
  const tile = (layer: ArchLayer) => (
    <AtlasLink
      class={[
        "at-arch-tile",
        layer.id === links().selected.id && "sel",
        links().selected.deps.includes(layer.id) && "dep",
        links().users.includes(layer.id) && "use",
      ]
        .filter(Boolean)
        .join(" ")}
      href={atlasHref("architecture", "", { ch: "packages", pkg: layer.id })}
    >
      <span>{layer.level}</span>
      <b>{layer.id}</b>
      <small>{language.t("orchestra.atlas.architecture.packages.lines", { loc: layer.loc })}</small>
    </AtlasLink>
  )
  return (
    <>
      <div class="at-ch-intro">
        <p>{language.t("orchestra.atlas.architecture.packages.intro")}</p>
      </div>
      <div class="at-arch">
        <div class="at-arch-stack">
          <div class="at-arch-col">
            <For each={ARCH_LAYER_ROWS}>
              {(row) => (
                <div class="at-arch-row">
                  <span class="at-arch-lv">{row[0]}</span>
                  <For each={row[1]}>{tile}</For>
                </div>
              )}
            </For>
          </div>
          <div class="at-arch-ring">
            <small>{language.t("orchestra.atlas.architecture.packages.ring")}</small>
            <For each={ARCH_RING}>{tile}</For>
          </div>
          <p class="at-hint">
            <span class="lgk dep" />
            {language.t("orchestra.atlas.architecture.packages.legend.dep", { id: links().selected.id })}
            {" · "}
            <span class="lgk use" />
            {language.t("orchestra.atlas.architecture.packages.legend.use", { id: links().selected.id })}
          </p>
        </div>
        <div class="at-arch-pkg">
          <div class="mx-eyebrow">
            {language.t("orchestra.atlas.architecture.packages.eyebrow", {
              level: links().selected.level,
              id: links().selected.id,
              loc: links().selected.loc,
            })}
          </div>
          <h2>{links().selected.id}</h2>
          <p>{language.t(links().selected.what)}</p>
          <ul>
            <For each={links().selected.key}>{(key) => <li>{language.t(key)}</li>}</For>
          </ul>
          <dl class="at-kv">
            <dt>{language.t("orchestra.atlas.architecture.packages.uses")}</dt>
            <dd>
              {links().selected.deps.join(", ") ||
                language.t(
                  ring() ? "orchestra.atlas.architecture.packages.everything" : "orchestra.atlas.architecture.packages.nothing",
                )}
            </dd>
            <dt>{language.t("orchestra.atlas.architecture.packages.usedBy")}</dt>
            <dd>
              {links().users.join(", ") || (ring() ? "—" : language.t("orchestra.atlas.architecture.packages.theRing"))}
            </dd>
          </dl>
        </div>
      </div>
      <p class="muted">{language.t("orchestra.atlas.architecture.packages.note")}</p>
    </>
  )
}

export function ArchPortable(props: { model: AtlasModel }) {
  const atlas = useAtlas()
  const language = useLanguage()
  return (
    <>
      <div class="at-ch-intro">
        <p>{language.t("orchestra.atlas.architecture.portable.intro")}</p>
        <Btn
          label={language.t("orchestra.atlas.architecture.portable.export")}
          icon="download"
          onClick={() => atlas.toast(language.t("orchestra.atlas.architecture.portable.export.toast"), "info")}
        />
      </div>
      <div class="at-okf-flow">
        <div class="at-okf-box">
          <b>cas/</b>
          <small>
            {language.plural("orchestra.atlas.architecture.portable.objects", props.model.R.casObjects, {
              n: num(props.model.R.casObjects),
            })}
          </small>
        </div>
        <Icon name="arrow" />
        <div class="at-okf-box file">
          <b>atlas-okf.json</b>
          <small>{'{ format: "atlas-okf", version: 1, objects }'}</small>
        </div>
        <Icon name="arrow" />
        <div class="at-okf-box">
          <b>{language.t("orchestra.atlas.architecture.portable.empty")}</b>
          <small>{language.t("orchestra.atlas.architecture.portable.empty.sub")}</small>
        </div>
        <Icon name="arrow" />
        <div class="at-okf-box dim">
          <b>{language.t("orchestra.atlas.architecture.portable.current")}</b>
          <small>{language.t("orchestra.atlas.architecture.portable.current.sub")}</small>
        </div>
      </div>
      <div class="at-rules">
        <For each={RULES}>
          {(rule) => (
            <div>
              <b>
                <Icon name="checkc" />
                {language.t(rule[0])}
              </b>
              <p>{language.t(rule[1])}</p>
            </div>
          )}
        </For>
      </div>
      <Tech
        rows={[
          [
            language.t("orchestra.atlas.architecture.portable.tech.commands"),
            <Rich text={language.t("orchestra.atlas.architecture.portable.tech.commands.text")} />,
          ],
          [
            language.t("orchestra.atlas.architecture.portable.tech.code"),
            <Rich text={language.t("orchestra.atlas.architecture.portable.tech.code.text")} />,
          ],
        ]}
      />
    </>
  )
}
