import { type ComponentProps, splitProps } from "solid-js"

type Variant = "normal" | "error" | "warning" | "success" | "info"

export interface CardProps extends ComponentProps<"div"> {
  variant?: Variant
}

function mix(style: ComponentProps<"div">["style"], value?: string) {
  if (!value) return style
  if (!style) return { "--card-accent": value }
  if (typeof style === "string") return `${style};--card-accent:${value};`
  return { ...(style as Record<string, string | number>), "--card-accent": value }
}

export function Card(props: CardProps) {
  const [split, rest] = splitProps(props, ["variant", "style", "class", "classList"])
  const variant = () => split.variant ?? "normal"
  const accent = () => {
    const v = variant()
    if (v === "error") return "var(--v2-state-fg-danger)"
    if (v === "warning") return "var(--icon-warning-active)"
    if (v === "success") return "var(--icon-success-active)"
    if (v === "info") return "var(--icon-info-active)"
    return
  }
  return (
    <div
      {...rest}
      data-component="card"
      data-variant={variant()}
      style={mix(split.style, accent())}
      classList={{
        ...split.classList,
        [split.class ?? ""]: !!split.class,
      }}
    >
      {props.children}
    </div>
  )
}

export function CardDescription(props: ComponentProps<"div">) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"])
  return (
    <div
      {...rest}
      data-slot="card-description"
      classList={{
        ...split.classList,
        [split.class ?? ""]: !!split.class,
      }}
    >
      {split.children}
    </div>
  )
}
