import { Dialog } from "@kobalte/core/dialog"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import {
  downloadText,
  pullRequestFilename,
  pullRequestMarkdown,
  pullRequestProposal,
  type PullRequestFile,
  type PullRequestProposal,
} from "./orchestra-pull-request-data"
import "@/orchestra/chapters/kit.css"

// The Review rail's Create PR flow from the approved mock: an editable proposal, then a preview the
// user can download as Markdown. Orchestra has no GitHub or GitLab connection, so nothing is sent.
export function OrchestraPullRequest(props: { sessionID?: string; files: () => PullRequestFile[] }) {
  const language = useLanguage()
  const sync = useSync()
  const sdk = useSDK()
  const [state, setState] = createStore({
    step: undefined as "edit" | "preview" | undefined,
    proposal: { title: "", from: "", base: "", description: "" } as PullRequestProposal,
  })
  let opener: HTMLButtonElement | undefined

  // V1 servers sync the branches. Otherwise the workspace's branch request fills the fields that are
  // still empty once it answers, so the dialog never waits on it.
  const open = () => {
    const vcs = sync().data.vcs
    setState({
      step: "edit",
      proposal: pullRequestProposal({
        title: props.sessionID ? sync().session.get(props.sessionID)?.title : undefined,
        branch: vcs?.branch,
        base: vcs?.default_branch,
        files: props.files(),
        copy: {
          summary: language.t("orchestra.chat.pr.summary"),
          files: language.t("orchestra.chat.pr.files"),
          noFiles: language.t("orchestra.chat.pr.noFiles"),
        },
      }),
    })
    if (vcs) return
    void sdk()
      .client.vcs.get()
      .then((result) => {
        if (state.step !== "edit") return
        if (!state.proposal.from && result.data?.branch) setState("proposal", "from", result.data.branch)
        if (!state.proposal.base && result.data?.default_branch) setState("proposal", "base", result.data.default_branch)
      })
      .catch(() => undefined)
  }
  const close = () => setState("step", undefined)
  const field = (name: keyof PullRequestProposal) => (event: { currentTarget: { value: string } }) =>
    setState("proposal", name, event.currentTarget.value)

  return (
    <>
      <button ref={opener} type="button" class="mx-btn" data-action="review-create-pr" onClick={open}>
        {language.t("orchestra.chat.pr.create")}
      </button>
      <Dialog open={!!state.step} onOpenChange={(next) => !next && close()}>
        <Dialog.Portal>
          <Dialog.Overlay class="orchestra-pr-backdrop" />
          <div class="orchestra-pr-layer">
            <Dialog.Content
              class="mx-dialog orchestra-pr-dialog"
              data-step={state.step}
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                opener?.focus()
              }}
            >
              <form
                autocomplete="off"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (state.step === "edit") setState("step", "preview")
                }}
              >
                <header class="mx-dialog-head">
                  <div>
                    <Dialog.Title as="h2">
                      {language.t(state.step === "preview" ? "orchestra.chat.pr.previewTitle" : "orchestra.chat.pr.title")}
                    </Dialog.Title>
                    <Dialog.Description>
                      <Show when={state.step === "preview"} fallback={language.t("orchestra.chat.pr.description")}>
                        <bdi dir="ltr">{`${state.proposal.from || "—"} → ${state.proposal.base || "—"}`}</bdi>
                      </Show>
                    </Dialog.Description>
                  </div>
                  <Dialog.CloseButton class="mx-link" aria-label={language.t("orchestra.chat.pr.close")}>
                    <svg class="orchestra-pr-icon" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m4 4 8 8m0-8-8 8" />
                    </svg>
                  </Dialog.CloseButton>
                </header>
                <div class="mx-dialog-body">
                  <Show
                    when={state.step === "preview"}
                    fallback={
                      <>
                        <label class="mx-field">
                          <span>{language.t("orchestra.chat.pr.titleField")}</span>
                          <input name="title" required value={state.proposal.title} onInput={field("title")} />
                        </label>
                        <div class="mx-fields">
                          <label class="mx-field">
                            <span>{language.t("orchestra.chat.pr.from")}</span>
                            <input name="from" required dir="ltr" value={state.proposal.from} onInput={field("from")} />
                          </label>
                          <label class="mx-field">
                            <span>{language.t("orchestra.chat.pr.base")}</span>
                            <input name="base" required dir="ltr" value={state.proposal.base} onInput={field("base")} />
                          </label>
                        </div>
                        <label class="mx-field">
                          <span>{language.t("orchestra.chat.pr.body")}</span>
                          <textarea name="description" value={state.proposal.description} onInput={field("description")} />
                        </label>
                      </>
                    }
                  >
                    <h3 class="orchestra-pr-heading">{state.proposal.title}</h3>
                    <pre class="mx-log">{state.proposal.description}</pre>
                    <p class="mx-note">{language.t("orchestra.chat.pr.notSent")}</p>
                    <button
                      type="button"
                      class="mx-btn"
                      data-action="pr-download"
                      onClick={() =>
                        downloadText(
                          pullRequestFilename(state.proposal.title),
                          pullRequestMarkdown(state.proposal),
                          "text/markdown",
                        )
                      }
                    >
                      {language.t("orchestra.chat.pr.download")}
                    </button>
                  </Show>
                </div>
                <footer class="mx-dialog-foot">
                  <button type="button" class="mx-btn" onClick={close}>
                    {language.t("orchestra.chat.pr.cancel")}
                  </button>
                  <Show when={state.step === "edit"}>
                    <button type="submit" class="mx-btn primary">
                      {language.t("orchestra.chat.pr.submit")}
                    </button>
                  </Show>
                </footer>
              </form>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog>
    </>
  )
}
