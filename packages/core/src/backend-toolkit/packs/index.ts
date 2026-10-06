import astGrep from "./ast-grep"
import buf from "./buf"
import datamodelCodegen from "./datamodel-codegen"
import gitleaks from "./gitleaks"
import kiota from "./kiota"
import ogen from "./ogen"
import openapiGenerator from "./openapi-generator"
import orval from "./orval"
import protocGenEs from "./protoc-gen-es"
import sqlc from "./sqlc"
import sqlx from "./sqlx"

// One import and one entry per pack (ruling M6-1); `script/toolkit-pack.ts add` writes both. Keyed by each pack's own
// id, in the order the toolkit lists them.
export const ENGINES = {
  [astGrep.id]: astGrep,
  [sqlc.id]: sqlc,
  [buf.id]: buf,
  [gitleaks.id]: gitleaks,
  [kiota.id]: kiota,
  [orval.id]: orval,
  [protocGenEs.id]: protocGenEs,
  [openapiGenerator.id]: openapiGenerator,
  [datamodelCodegen.id]: datamodelCodegen,
  [ogen.id]: ogen,
  [sqlx.id]: sqlx,
}
