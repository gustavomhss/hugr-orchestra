import { Show, type JSX } from "solid-js"
import type { SetStoreFunction } from "solid-js/store"
import { useMutation } from "@tanstack/solid-query"
import { Popover } from "@kobalte/core/popover"
import { Button } from "@orchestra/ui/button"
import { TextField } from "@orchestra/ui/text-field"
import { Icon as IconV2 } from "@orchestra/ui/v2/icon"
import { IconButtonV2 } from "@orchestra/ui/v2/icon-button-v2"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"

export type SessionShareState = { open: boolean; dismiss: "escape" | "outside" | null }

export function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data
    if (data?.message) return data.message
  }
  if (err instanceof Error) return err.message
  return fallback
}

// The session header's share popover. It anchors to whichever header control opened it.
export function SessionSharePopover(props: {
  sessionID: () => string | undefined
  url: () => string | undefined
  enabled: () => boolean
  share: SessionShareState
  setShare: SetStoreFunction<SessionShareState>
  anchor: () => HTMLElement | undefined
}) {
  const language = useLanguage()
  const settings = useSettings()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const sessionID = props.sessionID
  const shareUrl = props.url
  const shareEnabled = props.enabled
  const share = props.share
  const setShare = props.setShare
  const viewShare = () => {
    const url = shareUrl()
    if (!url) return
    platform.openExternal(url)
  }

  const shareMutation = useMutation(() => ({
    mutationFn: (id: string) => serverSDK().client.session.share({ sessionID: id }),
    onError: (err) => {
      console.error("Failed to share session", err)
    },
  }))

  const unshareMutation = useMutation(() => ({
    mutationFn: (id: string) => serverSDK().client.session.unshare({ sessionID: id }),
    onError: (err) => {
      console.error("Failed to unshare session", err)
    },
  }))

  const shareSession = () => {
    const id = sessionID()
    if (!id || shareMutation.isPending) return
    if (!shareEnabled()) return
    shareMutation.mutate(id)
  }

  const unshareSession = () => {
    const id = sessionID()
    if (!id || unshareMutation.isPending) return
    if (!shareEnabled()) return
    unshareMutation.mutate(id)
  }
  const copyShareUrl = () => {
    const url = shareUrl()
    if (!url) return
    void navigator.clipboard
      .writeText(url)
      .then(() =>
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("session.share.copy.copied"),
          description: url,
        }),
      )
      .catch((err: unknown) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(err, language.t("common.requestFailed")),
        }),
      )
  }
  const selectShareUrlText: JSX.EventHandler<HTMLDivElement, MouseEvent> = (event) => {
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(event.currentTarget)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  return (
    <Popover
      open={share.open}
      anchorRef={props.anchor}
      placement="bottom-end"
      gutter={settings.general.newLayoutDesigns() ? 6 : 4}
      modal={false}
      onOpenChange={(open) => {
        if (open) setShare("dismiss", null)
        setShare("open", open)
      }}
    >
      <Popover.Portal>
        <Popover.Content
          data-component="popover-content"
          classList={{
            "flex w-80 max-w-none flex-col items-start gap-3 rounded-[10px] border-0 bg-v2-background-bg-layer-01 p-3 shadow-[var(--v2-elevation-floating)]":
              settings.general.newLayoutDesigns(),
          }}
          style={{ "min-width": "320px" }}
          onEscapeKeyDown={(event) => {
            setShare({ dismiss: "escape", open: false })
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDownOutside={() => {
            setShare({ dismiss: "outside", open: false })
          }}
          onFocusOutside={() => {
            setShare({ dismiss: "outside", open: false })
          }}
          onCloseAutoFocus={(event) => {
            if (share.dismiss === "outside") event.preventDefault()
            setShare("dismiss", null)
          }}
        >
          <Show
            when={settings.general.newLayoutDesigns()}
            fallback={
              <div class="flex flex-col p-3">
                <div class="flex flex-col gap-1">
                  <div class="text-13-medium text-text-strong">{language.t("session.share.popover.title")}</div>
                  <div class="text-12-regular text-text-weak">
                    {shareUrl()
                      ? language.t("session.share.popover.description.shared")
                      : language.t("session.share.popover.description.unshared")}
                  </div>
                </div>
                <div class="mt-3 flex flex-col gap-2">
                  <Show
                    when={shareUrl()}
                    fallback={
                      <Button
                        size="large"
                        variant="primary"
                        class="w-full"
                        onClick={shareSession}
                        disabled={shareMutation.isPending}
                      >
                        {shareMutation.isPending
                          ? language.t("session.share.action.publishing")
                          : language.t("session.share.action.publish")}
                      </Button>
                    }
                  >
                    <div class="flex flex-col gap-2">
                      <TextField
                        value={shareUrl() ?? ""}
                        readOnly
                        copyable
                        copyKind="link"
                        tabIndex={-1}
                        class="w-full"
                      />
                      <div class="grid grid-cols-2 gap-2">
                        <Button
                          size="large"
                          variant="secondary"
                          class="w-full shadow-none border border-border-weak-base"
                          onClick={unshareSession}
                          disabled={unshareMutation.isPending}
                        >
                          {unshareMutation.isPending
                            ? language.t("session.share.action.unpublishing")
                            : language.t("session.share.action.unpublish")}
                        </Button>
                        <Button
                          size="large"
                          variant="primary"
                          class="w-full"
                          onClick={viewShare}
                          disabled={unshareMutation.isPending}
                        >
                          {language.t("session.share.action.view")}
                        </Button>
                      </div>
                    </div>
                  </Show>
                </div>
              </div>
            }
          >
            <div class="flex w-full flex-col gap-1.5 px-0.5 pt-0.5">
              <div class="select-none text-[13px] font-[530] leading-none tracking-[-0.04px] text-v2-text-text-base [font-variation-settings:'slnt'_0]">
                {language.t("session.share.popover.title")}
              </div>
              <div class="select-none text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted [font-variation-settings:'slnt'_0]">
                {shareUrl()
                  ? language.t("session.share.popover.description.shared")
                  : language.t("session.share.popover.description.unshared")}
              </div>
            </div>
            <div class="flex w-full flex-col gap-2">
              <Show
                when={shareUrl()}
                fallback={
                  <ButtonV2 variant="contrast" class="w-full" onClick={shareSession} disabled={shareMutation.isPending}>
                    {shareMutation.isPending
                      ? language.t("session.share.action.publishing")
                      : language.t("session.share.action.publish")}
                  </ButtonV2>
                }
              >
                <div class="flex flex-col gap-2">
                  <div
                    class="flex h-8 w-full items-center gap-1.5 rounded-[6px] py-1 pl-2.5 pr-1.5 shadow-[var(--v2-elevation-button-neutral)]"
                    style={{
                      background:
                        "linear-gradient(180deg, var(--v2-alpha-light-2) 0%, var(--v2-alpha-light-0) 100%), var(--v2-background-bg-button-neutral)",
                    }}
                  >
                    <div
                      class="min-w-0 flex-1 truncate select-text cursor-text text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base [font-variation-settings:'slnt'_0]"
                      onClick={selectShareUrlText}
                    >
                      {shareUrl()}
                    </div>
                    <IconButtonV2
                      type="button"
                      size="small"
                      variant="ghost-muted"
                      icon={<IconV2 name="outline-copy" />}
                      aria-label={language.t("session.share.copy.copyLink")}
                      onClick={copyShareUrl}
                    />
                    <IconButtonV2
                      type="button"
                      size="small"
                      variant="ghost-muted"
                      icon={<IconV2 name="outline-square-arrow" />}
                      aria-label={language.t("session.share.action.view")}
                      onClick={viewShare}
                      disabled={unshareMutation.isPending}
                    />
                  </div>
                  <div class="flex w-full">
                    <ButtonV2
                      variant="outline"
                      class="w-full"
                      onClick={unshareSession}
                      disabled={unshareMutation.isPending}
                    >
                      {unshareMutation.isPending
                        ? language.t("session.share.action.unpublishing")
                        : language.t("session.share.action.unpublish")}
                    </ButtonV2>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}
