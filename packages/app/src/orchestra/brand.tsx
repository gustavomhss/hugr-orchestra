import { useLanguage } from "@/context/language"

export function HugrBrand(props: { class?: string }) {
  const language = useLanguage()

  return (
    <div classList={{ "orchestra-brand": true, [props.class ?? ""]: !!props.class }}>
      <HugrImages />
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

function HugrImages() {
  return (
    <>
      <img
        data-slot="orchestra-brand-logo-dark"
        src="/orchestra/hugr-horizontal-compact-inverse.svg"
        width={121}
        height={32}
        alt="HuGR"
      />
      <img
        data-slot="orchestra-brand-logo-light"
        src="/orchestra/hugr-horizontal-compact-primary.svg"
        width={121}
        height={32}
        alt="HuGR"
      />
    </>
  )
}
