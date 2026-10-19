import { clamp } from "./src/clamp"

// The probe script (JE-AC-P1): prints the line a `stdoutIncludes` expectation looks for when the defect is present.
const got = clamp(10, 0, 10)
if (got !== 10) console.log(`DEFECT clamp(10, 0, 10) = ${got}, expected 10`)
else console.log("OK clamp(10, 0, 10) = 10")
