import { shout } from "./shout"
export function shoutTwice(msg: string): string {
  return shout(msg) + " " + shout(msg)
}
