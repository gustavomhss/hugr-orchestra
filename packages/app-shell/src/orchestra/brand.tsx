import { useLanguage } from "@/context/language"

export function HugrBrand(props: { class?: string; compact?: boolean }) {
  const language = useLanguage()

  return (
    <div classList={{ "orchestra-brand": true, [props.class ?? ""]: !!props.class }}>
      <HugrImages compact={props.compact} />
      <span data-slot="orchestra-brand-descriptor">{language.t("orchestra.brand.descriptor")}</span>
    </div>
  )
}

export function HugrSplash(props: { class?: string }) {
  return (
    <div classList={{ "orchestra-brand": true, "orchestra-brand-splash": true, [props.class ?? ""]: !!props.class }}>
      <HugrImages />
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

function HugrImages(props: { compact?: boolean }) {
  return (
    <>
      <img
        data-slot="orchestra-brand-logo-dark"
        src={props.compact ? "/orchestra/hugr-symbol-inverse.svg" : "/orchestra/hugr-horizontal-compact-inverse.svg"}
        width={props.compact ? 32 : 121}
        height={32}
        alt="HuGR"
      />
      <img
        data-slot="orchestra-brand-logo-light"
        src={props.compact ? "/orchestra/hugr-symbol-primary.svg" : "/orchestra/hugr-horizontal-compact-primary.svg"}
        width={props.compact ? 32 : 121}
        height={32}
        alt="HuGR"
      />
    </>
  )
}
