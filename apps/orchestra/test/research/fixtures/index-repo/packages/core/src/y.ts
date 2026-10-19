import { viaExports } from "./x"

export function relayed(value: number) {
  return viaExports(value) * 2
}
