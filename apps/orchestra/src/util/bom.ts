import { Effect } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { writePhysical } from "@orchestra/core/util/physical-path"

const BOM_CODE = 0xfeff
const BOM = String.fromCharCode(BOM_CODE)

export function split(text: string) {
  if (text.charCodeAt(0) !== BOM_CODE) return { bom: false, text }
  return { bom: true, text: text.slice(1) }
}

export function join(text: string, bom: boolean) {
  const stripped = split(text).text
  if (!bom) return stripped
  return BOM + stripped
}

export const readFile = Effect.fn("Bom.readFile")(function* (fs: FSUtil.Interface, filePath: string) {
  return split(new TextDecoder("utf-8", { ignoreBOM: true }).decode(yield* fs.readFile(filePath)))
})

/** `filePath` must already be the physical path of the file (see `physicalPath`). */
export const syncFile = Effect.fn("Bom.syncFile")(function* (fs: FSUtil.Interface, filePath: string, bom: boolean) {
  const current = yield* readFile(fs, filePath)
  if (current.bom === bom) return current.text
  yield* Effect.promise(() => writePhysical(filePath, join(current.text, bom)))
  return current.text
})
