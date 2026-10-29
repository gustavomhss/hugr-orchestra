import { useLanguage } from "@/context/language"

export function HugrBrand(props: { class?: string; compact?: boolean }) {
  const language = useLanguage()

  return (
    <div classList={{ "orchestra-brand": true, [props.class ?? ""]: !!props.class }}>
      <HugrImages
        name={props.compact ? "hugr-symbol" : "hugr-lockup"}
        width={props.compact ? 32 : 120}
        height={props.compact ? 32 : 40}
      />
      <span data-slot="orchestra-brand-descriptor">{language.t("orchestra.brand.name")}</span>
    </div>
  )
}

export function HugrSplash(props: { class?: string }) {
  return (
    <div classList={{ "orchestra-brand": true, "orchestra-brand-splash": true, [props.class ?? ""]: !!props.class }}>
      <HugrImages name="hugr-horizontal-compact" width={121} height={32} />
    </div>
  )
}

// The HuGR symbol where a screen shows a product mark, such as a faint empty state. The caller sets the width.
export function HugrMark(props: { class?: string }) {
  return (
    <span classList={{ "orchestra-mark": true, [props.class ?? ""]: !!props.class }} aria-hidden="true">
      <img data-slot="orchestra-brand-logo-dark" src="/orchestra/hugr-symbol-inverse.svg" alt="" />
      <img data-slot="orchestra-brand-logo-light" src="/orchestra/hugr-symbol-primary.svg" alt="" />
    </span>
  )
}

// The sidebar lockup drops the wordmark's H, because the symbol already reads as one; the splash keeps the full wordmark.
function HugrImages(props: {
  name: "hugr-symbol" | "hugr-lockup" | "hugr-horizontal-compact"
  width: number
  height: number
}) {
  return (
    <>
      <img
        data-slot="orchestra-brand-logo-dark"
        src={`/orchestra/${props.name}-inverse.svg`}
        width={props.width}
        height={props.height}
        alt="HuGR"
      />
      <img
        data-slot="orchestra-brand-logo-light"
        src={`/orchestra/${props.name}-primary.svg`}
        width={props.width}
        height={props.height}
        alt="HuGR"
      />
    </>
  )
}
