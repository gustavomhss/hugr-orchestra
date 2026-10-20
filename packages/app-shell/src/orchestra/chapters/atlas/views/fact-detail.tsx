import { createEffect, For, type JSX, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasFact, AtlasModel } from "../atlas-model"
import { atlasHref, type AtlasRoute } from "../atlas-route"
import { FilePath, HashV, Help, Icon, Second, StateChip, useAtlasWords } from "../kit/chips"
import { Btn, rememberOpen, Tech } from "../kit/controls"
import { AtlasLink } from "../kit/text"
import { openAtlasSheet } from "../sheets/state"

// A fact: can I trust this sentence, and where did it come from? (specs/atlas-ui/mock/views.js:161-210). The
// inspector (views/inspector.tsx) and the fact page (views/fact.tsx) both show this body.
const REASONING_CUT = 520

export function FactBody(props: { fact: AtlasFact; model: AtlasModel; route: AtlasRoute }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const x = () => props.fact
  const staged = () => x().kind === "candidate" && !x().promotedNow
  const state = () => (staged() ? "pending" : props.model.state(x()))
  // D3: the reasoning is read one entry at a time and cached by the controller.
  createEffect(() => {
    const id = x().why
    if (id) void atlas.controller.reasoning(id)
  })
  const why = () => {
    const id = x().why
    if (!id) return undefined
    const entry = atlas.controller.state.reasoning[id]
    return entry?.state === "ok" ? entry.text : undefined
  }
  const full = () => props.route.query.why === "all"
  const same = () => props.model.live().filter((y) => y.file === x().file && y.key !== x().key)
  const importers = () => props.model.R.dependents[x().file] ?? []
  const writers = () => props.model.R.policy[x().scope] ?? []
  const unit = () => props.model.unitOf(x().file)
  const none = () => language.t("orchestra.atlas.fact.tech.none")
  const tech = (): (readonly [string, JSX.Element] | false)[] => [
    [language.t("orchestra.atlas.fact.tech.kind"), `${x().factKind ?? "advisory"} · ${x().family}`],
    [
      language.t("orchestra.atlas.fact.tech.anchor"),
      <>
        <code>{x().anchor?.qualifiedPath ?? x().file}</code> · {x().anchor?.kind ?? "file"}
      </>,
    ],
    [language.t("orchestra.atlas.fact.tech.nodeKey"), <HashV hash={x().key} />],
    [language.t("orchestra.atlas.fact.tech.contentHash"), <HashV hash={x().hash} />],
    [language.t("orchestra.atlas.fact.tech.subtreeHash"), <HashV hash={x().subtree} />],
    [language.t("orchestra.atlas.fact.tech.tier"), `${x().tier} · ${x().retired ? "SUPERSEDED" : (x().authoring ?? "ADVISORY")}`],
    [language.t("orchestra.atlas.fact.tech.freshness"), x().storedFreshness ?? "FRESH"],
    [
      language.t("orchestra.atlas.fact.tech.scope"),
      <>
        <code>{x().scope}</code> ·{" "}
        {language.t("orchestra.atlas.fact.tech.writtenBy", {
          writers: writers().join(", ") || language.t("orchestra.atlas.fact.tech.nobody"),
        })}
      </>,
    ],
    [language.t("orchestra.atlas.fact.tech.slot"), x().slot ?? none()],
    [
      language.t("orchestra.atlas.fact.tech.obvious"),
      language.t("orchestra.atlas.fact.tech.obvious.value", {
        obvious: x().obvious ?? "—",
        by: x().obviousBy ?? "harness-predicate",
      }),
    ],
    [language.t("orchestra.atlas.fact.tech.seal"), language.t("orchestra.atlas.fact.tech.seal.value")],
    [language.t("orchestra.atlas.fact.tech.links"), language.t("orchestra.atlas.fact.tech.seal.value")],
    [
      language.t("orchestra.atlas.fact.tech.generation"),
      staged()
        ? language.t("orchestra.atlas.fact.tech.staging", { gen: props.model.R.stagingGen })
        : language.t("orchestra.atlas.fact.tech.projection", { gen: props.model.R.gen }),
    ],
    !!x().why && [language.t("orchestra.atlas.fact.tech.answerRef"), <HashV hash={x().why} />],
    [
      language.t("orchestra.atlas.fact.tech.check"),
      <Btn label={language.t("orchestra.atlas.fact.tech.checkCode")} onClick={() => openAtlasSheet({ kind: "verify", scope: x().file })} />,
    ],
  ]
  return (
    <>
      <p class="ins-claim">{x().claim}</p>
      <div class="ins-states">
        <StateChip state={state()} />
        <Second fact={x()} />
        <span class="ins-meta">
          {language.t("orchestra.atlas.fact.meta", { origin: words.origin(x()), file: x().file.split("/").at(-1) ?? x().file })}
        </span>
      </div>
      <Show when={props.model.provenance() !== "trusted" && !staged()}>
        <div class="ins-note">
          <Icon name="lock" />
          <span>{language.t("orchestra.atlas.fact.notSent")}</span>
        </div>
      </Show>
      <Show when={!x().regrounded && x().drift}>
        {(drift) => (
          <Section
            id="changed"
            open
            title={
              <>
                {language.t("orchestra.atlas.fact.changed")}{" "}
                <span class="at-state warm" data-tip={language.t("orchestra.atlas.fact.changed.gone.tip")}>
                  {language.t("orchestra.atlas.fact.changed.gone")}
                </span>
              </>
            }
          >
            <p class="ins-sub">
              {language.plural("orchestra.atlas.fact.changed.lead", drift().commits.length, {
                n: drift().commits.length,
                stat: drift().stat,
              })}{" "}
              <Show when={!staged()} fallback={language.t("orchestra.atlas.fact.changed.staged")}>
                {language.t("orchestra.atlas.fact.changed.rewrite")}{" "}
                <Help text={language.t("orchestra.atlas.fact.changed.rewrite.help")} />
              </Show>
            </p>
            <For each={drift().commits}>
              {(commit) => (
                <div class="at-commit">
                  <code class="at-sha">{commit[0]}</code>
                  <span>{commit[1]}</span>
                </div>
              )}
            </For>
            <For each={drift().hunks.slice(0, 1)}>
              {(hunk) => (
                <div class="at-code">
                  <div class="at-code-head">
                    <span>@@ {hunk.at} @@</span>
                  </div>
                  <pre>
                    <For each={hunk.lines}>
                      {(line) => (
                        <div class={`ln ${line[0] === "+" ? "add" : line[0] === "-" ? "del" : ""}`}>
                          <span />
                          <span>{line.slice(1)}</span>
                        </div>
                      )}
                    </For>
                  </pre>
                </div>
              )}
            </For>
          </Section>
        )}
      </Show>
      <Section id="code" title={language.t("orchestra.atlas.fact.code")}>
        <AtlasLink class="at-fileline" href={atlasHref("unit", x().file)}>
          <Icon name="fact" />
          <FilePath path={x().file} />
          <Icon name="arrow" />
        </AtlasLink>
        <p class="mx-note">
          {language.t("orchestra.atlas.fact.code.note")} {language.t("orchestra.atlas.fact.code.unit")}{" "}
          <AtlasLink class="mx-link" href={atlasHref("unit", unit())}>
            {unit()}
          </AtlasLink>
          .
        </p>
      </Section>
      <Show when={why()}>
        {(text) => (
          <Section id="why" title={language.t("orchestra.atlas.fact.why")}>
            <div class="at-reasoning" classList={{ short: !full() }}>
              {full() ? text() : text().slice(0, REASONING_CUT)}
              {full() || text().length <= REASONING_CUT ? "" : "…"}
            </div>
            <Show when={text().length > REASONING_CUT}>
              <button type="button" class="mx-link" onClick={() => atlas.setQuery({ why: full() ? undefined : "all" })}>
                {language.t(full() ? "orchestra.atlas.fact.why.less" : "orchestra.atlas.fact.why.more")}
              </button>
            </Show>
            <p class="mx-note">{language.t("orchestra.atlas.fact.why.note")}</p>
          </Section>
        )}
      </Show>
      <Section id="history" title={language.t("orchestra.atlas.fact.history")}>
        <ul class="at-timeline">
          <Step tone="blue" icon="sparkle" title={language.t("orchestra.atlas.fact.history.mined")}>
            {language.t("orchestra.atlas.fact.history.mined.text")}
          </Step>
          <Show
            when={!staged()}
            fallback={
              <Step tone="" icon="clock" title={language.t("orchestra.atlas.fact.history.waiting")}>
                {language.t("orchestra.atlas.fact.history.waiting.text")}
              </Step>
            }
          >
            <Step tone="good" icon="check" title={language.t("orchestra.atlas.fact.history.accepted")}>
              {language.t("orchestra.atlas.fact.history.accepted.text")} <code class="at-sha">{x().derivedAt}</code>
            </Step>
          </Show>
          <Show when={x().tier !== "T2"}>
            <Step
              tone="good"
              icon="shield"
              title={language.t(x().tier === "T0" ? "orchestra.atlas.fact.history.core" : "orchestra.atlas.fact.history.ratified")}
            >
              {language.t("orchestra.atlas.fact.history.approver")}
            </Step>
          </Show>
          <Step tone="" icon="minusc" title={language.t("orchestra.atlas.fact.history.unproven")}>
            {language.t("orchestra.atlas.fact.history.unproven.text")}
          </Step>
          <Show when={x().retired}>
            <Step tone="" icon="minusc" title={language.t("orchestra.atlas.fact.history.replaced")}>
              {language.t("orchestra.atlas.fact.history.replaced.text")}
            </Step>
          </Show>
        </ul>
      </Section>
      <Section id="related" title={language.t("orchestra.atlas.fact.related")}>
        <Show when={same().length}>
          <h5>{language.t("orchestra.atlas.fact.related.sameFile")}</h5>
          <For each={same().slice(0, 4)}>
            {(y) => (
              <div class="ins-rel" data-action="open" data-value={y.key} tabindex="0" onClick={() => atlas.open(y.key)}>
                <StateChip state={props.model.state(y)} />
                <span class="ins-rel-claim">{y.claim}</span>
              </div>
            )}
          </For>
        </Show>
        <h5>{language.t("orchestra.atlas.fact.related.sameAs")}</h5>
        <div class="at-linkrow static">
          <span>{language.t("orchestra.atlas.fact.related.noSame")}</span>
          <span class="grow" />
          <Show when={!staged()}>
            <Btn label={language.t("orchestra.atlas.fact.related.link")} onClick={() => openAtlasSheet({ kind: "link", key: x().key })} />
          </Show>
        </div>
        <h5>{language.t("orchestra.atlas.fact.related.broader")}</h5>
        <div class="at-linkrow static">
          <span>{language.t("orchestra.atlas.fact.related.noBroader")}</span>
          <Help text={language.t("orchestra.atlas.fact.related.broader.help")} />
        </div>
        <h5>{language.t("orchestra.atlas.fact.related.importers")}</h5>
        <Show when={importers().length} fallback={<p class="mx-note">{language.t("orchestra.atlas.fact.related.noImporters")}</p>}>
          <For each={importers().slice(0, 5)}>
            {(file) => (
              <AtlasLink class="at-linkrow" href={atlasHref("unit", file)}>
                <Icon name="code" />
                <code class="at-mono">{file}</code>
              </AtlasLink>
            )}
          </For>
        </Show>
      </Section>
      <Tech rows={tech()} />
    </>
  )
}

// Copies the fact page's address and says so, also when the clipboard refuses (mock app.js:339, :567-570).
export function useCopyLink() {
  const atlas = useAtlas()
  const language = useLanguage()
  return (key: string) => {
    const done = () => atlas.toast(language.t("orchestra.atlas.fact.linkCopied"), "copy")
    const text = new URL(atlasHref("fact", key), location.href).href
    if (!navigator.clipboard) return done()
    void navigator.clipboard.writeText(text).then(done, done)
  }
}

// One remembered section of the fact body (the mock's sec(), views.js:173).
function Section(props: { id: string; title: JSX.Element; open?: boolean; children: JSX.Element }) {
  return (
    <details class="ins-acc" ref={rememberOpen(`fact-${props.id}`, props.open)}>
      <summary>
        <Icon name="chev" />
        <span>{props.title}</span>
      </summary>
      <div class="ins-acc-body">{props.children}</div>
    </details>
  )
}

// One History entry.
function Step(props: { tone: string; icon: "sparkle" | "clock" | "check" | "shield" | "minusc"; title: string; children: JSX.Element }) {
  return (
    <li>
      <span class={`at-tl-dot ${props.tone}`}>
        <Icon name={props.icon} />
      </span>
      <div class="at-tl-body">
        <strong>{props.title}</strong>
        <small>{props.children}</small>
      </div>
    </li>
  )
}
