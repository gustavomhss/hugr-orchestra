// A controlled model command: no answer until every peer has entered. Sequential dispatch cannot pass.
// Invoked only through Atlas's existing model-command adapter, never by another process-spawn seam.
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [directory, width] = process.argv.slice(2)
if (!directory || !/^[1-9][0-9]*$/.test(width ?? "")) throw new Error("pool-control: invalid arguments")
readFileSync(0)
writeFileSync(join(directory, `${process.pid}.entered`), "entered\n")
const start = performance.now()
while (readdirSync(directory).filter((file) => file.endsWith(".entered")).length < Number(width)) {
  if (performance.now() - start > 15000) throw new Error("pool-control: peers did not enter concurrently")
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
}
console.log("NO-FACT")
