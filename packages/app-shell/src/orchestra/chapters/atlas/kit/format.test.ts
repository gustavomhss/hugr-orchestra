import { describe, expect, test } from "bun:test"
import { esc, hash, highlight, num, seatName, short } from "./format"

describe("atlas kit format", () => {
  test("formats numbers and short hashes", () => {
    expect(num(1234567)).toBe("1,234,567")
    expect(short("abcdef0123", 4)).toBe("abcd")
    expect(short("abcdef0123")).toBe("abcdef01")
    expect(short(null)).toBe("")
  })

  test("fingerprints a seed the same way as the mock", () => {
    expect(hash("x")).toBe("88017b157ee0fc92")
    expect(hash("packages/a")).toBe("37ededc6267c5ece")
  })

  test("names seats from their ids", () => {
    expect(["backend", "jimmy", "maestro", "you", "seat:orchestrator"].map(seatName)).toEqual(["Backend", "Jimmy", "Maestro", "You", "seat:orchestrator"])
  })

  test("escapes before highlighting", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
    expect(highlight('export const A = "x" // <b>')).toBe(
      '<span class="tk-k">export</span> <span class="tk-k">const</span> A = <span class="tk-s">&quot;x&quot;</span> <span class="tk-c">// &lt;b&gt;</span>',
    )
    expect(highlight("type Store = Map")).toBe('<span class="tk-k">type</span> <span class="tk-t">Store</span> = <span class="tk-t">Map</span>')
  })
})
