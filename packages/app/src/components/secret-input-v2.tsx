import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { TextInputV2, type TextInputV2Props } from "@orchestra/ui/v2/text-input-v2"
import { createSignal, createUniqueId, type JSX, splitProps } from "solid-js"
import { useLanguage } from "@/context/language"

// Keeps a secret masked unless the user explicitly reveals it. The toggle swaps its visible label
// instead of using aria-pressed, because a pressed-state button must keep a constant name.
export function SecretInputV2(props: Omit<TextInputV2Props, "type" | "id" | "class"> & { label: JSX.Element }) {
  const language = useLanguage()
  const [local, input] = splitProps(props, ["label"])
  const [revealed, setRevealed] = createSignal(false)
  const id = createUniqueId()

  return (
    <div class="flex w-full flex-col gap-1 font-[530] leading-4 text-v2-text-text-base">
      <label for={id}>{local.label}</label>
      <div class="flex w-full items-center gap-2">
        <TextInputV2 {...input} id={id} class="!min-w-0 !flex-1" type={revealed() ? "text" : "password"} />
        <ButtonV2 type="button" variant="ghost" aria-controls={id} onClick={() => setRevealed((value) => !value)}>
          {language.t(revealed() ? "orchestra.env.hide" : "orchestra.env.reveal")}
        </ButtonV2>
      </div>
    </div>
  )
}
