import { Dialog } from "@kobalte/core/dialog"
import { Match, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { ExternalLink } from "@/components/external-link"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { downloadText } from "@/utils/download"
import { createdPullRequest, pullRequestCall, pullRequestCli, type PullRequestFailure } from "@/utils/pull-request"
import {
  pullRequestFilename,
  pullRequestMarkdown,
  pullRequestProposal,
  type PullRequestFile,
  type PullRequestProposal,
} from "./orchestra-pull-request-data"
import "@/orchestra/chapters/kit.css"

// The Review rail's Create PR flow from the approved mock: an editable proposal, then a result. The server
// opens the pull request with the gh or glab CLI signed in there; success is only the address that CLI
// returned. Any other answer keeps the proposal as a Markdown download with one line saying why.
export function OrchestraPullRequest(props: { sessionID?: string; files: () => PullRequestFile[] }) {
  const language = useLanguage()
  const sync = useSync()
  const sdk = useSDK()
  const [state, setState] = createStore({
    step: undefined as "edit" | "result" | undefined,
    busy: false,
    proposal: { title: "", from: "", base: "", description: "" } as PullRequestProposal,
    created: undefined as { url: string; number: number } | undefined,
    failure: undefined as PullRequestFailure | undefined,
  })
  let opener: HTMLButtonElement | undefined

  // V1 servers sync the branches. Otherwise the workspace's branch request fills the fields that are
  // still empty once it answers, so the dialog never waits on it.
  const open = () => {
    const vcs = sync().data.vcs
    setState({
      step: "edit",
      busy: false,
      created: undefined,
      failure: undefined,
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
        if (!state.proposal.base && result.data?.default_branch)
          setState("proposal", "base", result.data.default_branch)
      })
      .catch(() => undefined)
  }
  // A request in flight keeps the dialog open so its answer, and any address, is never dropped.
  const close = () => !state.busy && setState("step", undefined)
  const field = (name: keyof PullRequestProposal) => (event: { currentTarget: { value: string } }) =>
    setState("proposal", name, event.currentTarget.value)

  const submit = async () => {
    const proposal = state.proposal
    if (state.step !== "edit" || state.busy || !proposal.title.trim() || !proposal.base.trim()) return
    setState("busy", true)
    const result = await pullRequestCall(
      sdk().client.v2.pullRequest.create(
        {
          location: { directory: sdk().directory },
          pullRequestCreateInput: {
            title: proposal.title.trim(),
            body: proposal.description,
            base: proposal.base.trim(),
            head: proposal.from.trim() || undefined,
          },
        },
        { throwOnError: false },
      ),
      createdPullRequest,
    )
    setState({
      busy: false,
      step: "result",
      created: "data" in result ? result.data : undefined,
      failure: "failure" in result ? result.failure : undefined,
    })
  }

  const reason = (failure: PullRequestFailure) => {
    const cli = pullRequestCli(failure.host)
    if (failure.reason === "not_installed") return language.t("orchestra.chat.pr.reason.notInstalled", { cli })
    if (failure.reason === "not_authenticated") return language.t("orchestra.chat.pr.reason.notAuthenticated", { cli })
    if (failure.reason === "no_remote") return language.t("orchestra.chat.pr.reason.noRemote")
    if (failure.reason === "branch_not_pushed" && failure.branch && failure.remote)
      return language.t("orchestra.chat.pr.reason.notPushed", { branch: failure.branch, remote: failure.remote })
    if (failure.reason === "branch_not_pushed") return language.t("orchestra.chat.pr.reason.noBranch")
    if (failure.reason === "cli_failed")
      return language.t("orchestra.chat.pr.reason.cliFailed", {
        message: (failure.message ?? cli).replace(/[.\s]+$/, ""),
      })
    if (failure.reason === "unavailable") return language.t("orchestra.chat.pr.reason.unavailable")
    return language.t("orchestra.chat.pr.reason.unconfirmed")
  }

  const title = () => {
    if (state.step === "edit") return language.t("orchestra.chat.pr.title")
    return language.t(state.created ? "orchestra.chat.pr.createdTitle" : "orchestra.chat.pr.previewTitle")
  }

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
              data-outcome={state.step === "result" ? (state.created ? "created" : "fallback") : undefined}
              aria-busy={state.busy}
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                opener?.focus()
              }}
            >
              <form
                autocomplete="off"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit()
                }}
              >
                <header class="mx-dialog-head">
                  <div>
                    <Dialog.Title as="h2">{title()}</Dialog.Title>
                    <Dialog.Description>
                      <Show when={state.step === "result"} fallback={language.t("orchestra.chat.pr.description")}>
                        <bdi dir="ltr">{`${state.proposal.from || "—"} → ${state.proposal.base || "—"}`}</bdi>
                      </Show>
                    </Dialog.Description>
                  </div>
                  <Dialog.CloseButton
                    class="mx-link"
                    disabled={state.busy}
                    aria-label={language.t("orchestra.chat.pr.close")}
                  >
                    <svg class="orchestra-pr-icon" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m4 4 8 8m0-8-8 8" />
                    </svg>
                  </Dialog.CloseButton>
                </header>
                <div class="mx-dialog-body">
                  <Switch>
                    <Match when={state.step === "edit"}>
                      <fieldset class="orchestra-pr-fields" disabled={state.busy}>
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
                          <textarea
                            name="description"
                            value={state.proposal.description}
                            onInput={field("description")}
                          />
                        </label>
                      </fieldset>
                    </Match>
                    <Match when={state.created}>
                      {(created) => (
                        <>
                          <h3 class="orchestra-pr-heading">{state.proposal.title}</h3>
                          <p class="mx-note" role="status">
                            {language.t("orchestra.chat.pr.created")}{" "}
                            <ExternalLink href={created().url} class="mx-link" data-action="pr-open">
                              {created().url}
                            </ExternalLink>
                          </p>
                        </>
                      )}
                    </Match>
                    <Match when={state.failure}>
                      {(failure) => (
                        <>
                          <h3 class="orchestra-pr-heading">{state.proposal.title}</h3>
                          <pre class="mx-log">{state.proposal.description}</pre>
                          <p class="mx-note" role="status" data-reason={failure().reason}>
                            {reason(failure())}
                          </p>
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
                        </>
                      )}
                    </Match>
                  </Switch>
                </div>
                <footer class="mx-dialog-foot">
                  <button type="button" class="mx-btn" disabled={state.busy} onClick={close}>
                    {language.t(state.step === "result" ? "orchestra.chat.pr.done" : "orchestra.chat.pr.cancel")}
                  </button>
                  <Show when={state.step === "edit"}>
                    <button type="submit" class="mx-btn primary" disabled={state.busy}>
                      {language.t(state.busy ? "orchestra.chat.pr.creating" : "orchestra.chat.pr.submit")}
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
