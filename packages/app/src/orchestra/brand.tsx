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
