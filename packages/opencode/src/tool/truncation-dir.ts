import path from "path"
import { Global } from "@opencode-ai/core/global"
import { FSUtil } from "@opencode-ai/core/fs-util"

// Tools ask external-directory access with the real path (on Windows a short 8.3 segment such as RUNNER~1 is expanded),
// so the saved-output directory and the rules that allow it use the real path too. Global creates the data directory.
export const TRUNCATION_DIR = path.join(FSUtil.normalizePath(Global.Path.data), "tool-output")
