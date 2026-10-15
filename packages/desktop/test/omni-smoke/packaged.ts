// Hosted actual packaged desktop proof. Original allTrees3 remains mandatory; full matrix extends it.
import path from "node:path"
import { provenance } from "./build"
import { matrix, requiredFixtures } from "./matrix"

if (!process.env.CI) throw new Error("packaged desktop proof requires hosted CI")
const flag = process.argv.indexOf("--require")
requiredFixtures((flag > 0 ? process.argv[flag + 1] ?? "" : "main,shell,terminal").split(",").filter(Boolean))
const app = process.argv[2]
if (app && !app.startsWith("--") && path.resolve(app) !== path.resolve(provenance().executable)) throw new Error("requested executable differs from source-pinned actual app")
process.exitCode = (await matrix()).pass ? 0 : 1
