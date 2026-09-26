import type { ImgHTMLAttributes } from "react";

const dimensions = {
  symbol: [512, 512],
  wordmark: [696, 182],
  stacked: [704, 774],
  horizontal: [902, 254],
  "horizontal-compact": [484, 128],
} as const;

type Composition = keyof typeof dimensions;
type Variant = "primary" | "inverse" | "flat" | "mono-white" | "mono-dark";
export type HuGRLogoProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height" | "alt"
> & {
  composition?: Composition;
  variant?: Variant;
  width?: number;
  height?: number;
  /** Directory containing the supplied logos/ folder. */
  basePath?: string;
  decorative?: boolean;
  alt?: string;
};

/** External SVG keeps definitions isolated across many instances. */
export function HuGRLogo({
  composition = "horizontal-compact",
  variant = "primary",
  width,
  height,
  basePath = "/brand",
  decorative = false,
  alt = "HuGR — Human Guardrail",
  style,
  ...props
}: HuGRLogoProps) {
  const [intrinsicWidth, intrinsicHeight] = dimensions[composition];
  const displayWidth = width ?? (height !== undefined
    ? height * intrinsicWidth / intrinsicHeight
    : composition === "symbol" ? 48 : 240);
  const displayHeight = height ?? displayWidth * intrinsicHeight / intrinsicWidth;
  return (
    <img
      {...props}
      src={`${basePath.replace(/\/$/, "")}/logos/hugr-${composition}-${variant}.svg`}
      width={displayWidth}
      height={displayHeight}
      alt={decorative ? "" : alt}
      aria-hidden={decorative ? true : undefined}
      decoding="async"
      style={{ display: "block", maxWidth: "100%", height: "auto", ...style }}
    />
  );
}
