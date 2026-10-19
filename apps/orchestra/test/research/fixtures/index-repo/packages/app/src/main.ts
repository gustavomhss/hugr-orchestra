import { aliasOnly } from "@/util/alias-only"
import { viaExports } from "@fixture/core/x"
import { relayed } from "@fixture/core/y"

export function main() {
  return [aliasOnly("main"), viaExports(1), relayed(2)]
}
