import { runBrowserSuite } from "../packages/core/script/test-browser"
export { runBrowserSuite, validateBrowserSuite } from "../packages/core/script/test-browser"

if (import.meta.main) await runBrowserSuite()
