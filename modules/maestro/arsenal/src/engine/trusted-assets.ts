// Installed runtime assets are code, not project permission resources.
// The factory has a closed selector and accepts no model-supplied paths.
import { createRequire } from "node:module";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AcquisitionError, inside } from "./acquisition.ts";

export function trustedAsset(kind: "typescript" | "parser-worker") {
  if (kind !== "typescript" && kind !== "parser-worker") throw new AcquisitionError("TRUSTED_ASSET_KIND_INVALID", "closed runtime asset selector required");
  const local = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
  const metadata = kind === "typescript"
    ? createRequire(import.meta.url).resolve("typescript/package.json")
    : join(local, "package.json");
  const root = dirname(realpathSync(metadata));
  const info: unknown = JSON.parse(readFileSync(metadata, "utf8"));
  const expected = kind === "typescript" ? "typescript" : "@orchestra/maestro-arsenal";
  if (!info || typeof info !== "object" || !("name" in info) || info.name !== expected)
    throw new AcquisitionError("TRUSTED_ASSET_PACKAGE_INVALID", expected);
  const entry = realpathSync(kind === "typescript"
    ? createRequire(import.meta.url).resolve("typescript")
    : fileURLToPath(new URL("../onboard/parser-worker.ts", import.meta.url)));
  if (!inside(root, entry) || !lstatSync(entry).isFile())
    throw new AcquisitionError("TRUSTED_ASSET_ESCAPE", entry);
  if (kind === "typescript" && (!("main" in info) || typeof info.main !== "string" || realpathSync(resolve(root, info.main)) !== entry))
    throw new AcquisitionError("TRUSTED_ASSET_ENTRY_INVALID", expected);
  return Object.freeze({ kind, root, entry });
}
