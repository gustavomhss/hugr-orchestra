import { greet } from "./greet"
export function greetTwice(name: string): string {
  return greet(name) + " " + greet(name)
}
