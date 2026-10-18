import { GlobalRegistrator } from "@happy-dom/global-registrator"

// GlobalRegistrator 20.12 has no exclusion option. Keep Bun's HTTP/Abort family together:
// Bun.serve rejects Happy DOM Responses, and Happy DOM fetch adds browser CORS preflights.
const native = Object.fromEntries(
  [
    "fetch",
    "Request",
    "Response",
    "Headers",
    "FormData",
    "Blob",
    "File",
    "AbortController",
    "AbortSignal",
    "DOMException",
  ].map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    if (!descriptor) throw new Error(`Missing native global property descriptor: ${key}`)
    return [key, descriptor] as const
  }),
)
GlobalRegistrator.register()
// GlobalWindow aliases defaultView to globalThis; retain DOM form serialization before restoring native HTTP globals.
export const DOMFormData = window.FormData
Object.defineProperties(globalThis, native)

const originalGetContext = HTMLCanvasElement.prototype.getContext
// @ts-expect-error - we're overriding with a simplified mock
HTMLCanvasElement.prototype.getContext = function (contextType: string, _options?: unknown) {
  if (contextType === "2d") {
    return {
      canvas: this,
      fillStyle: "#000000",
      strokeStyle: "#000000",
      font: "12px monospace",
      textAlign: "start",
      textBaseline: "alphabetic",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: true,
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      miterLimit: 10,
      shadowBlur: 0,
      shadowColor: "rgba(0, 0, 0, 0)",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: (text: string) => ({ width: text.length * 8 }),
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      scale: () => {},
      rotate: () => {},
      translate: () => {},
      transform: () => {},
      setTransform: () => {},
      resetTransform: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => null,
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      arc: () => {},
      arcTo: () => {},
      ellipse: () => {},
      rect: () => {},
      fill: () => {},
      stroke: () => {},
      clip: () => {},
      isPointInPath: () => false,
      isPointInStroke: () => false,
      getTransform: () => ({}),
      getImageData: () => ({
        data: new Uint8ClampedArray(0),
        width: 0,
        height: 0,
      }),
      putImageData: () => {},
      createImageData: () => ({
        data: new Uint8ClampedArray(0),
        width: 0,
        height: 0,
      }),
    } as unknown as CanvasRenderingContext2D
  }
  return originalGetContext.call(this, contextType as "2d", _options)
}
