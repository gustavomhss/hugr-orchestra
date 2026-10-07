import astGrep from "./ast-grep"
import buf from "./buf"
import datamodelCodegen from "./datamodel-codegen"
import gitleaks from "./gitleaks"
import kiota from "./kiota"
import kyselyCodegen from "./kysely-codegen"
import ogen from "./ogen"
import openapiGenerator from "./openapi-generator"
import orval from "./orval"
import postgresLanguageServer from "./postgres-language-server"
import protocGenEs from "./protoc-gen-es"
import sqlc from "./sqlc"
import sqlglot from "./sqlglot"
import sqlx from "./sqlx"
import squawk from "./squawk"

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
  [squawk.id]: squawk,
  [postgresLanguageServer.id]: postgresLanguageServer,
  [sqlglot.id]: sqlglot,
  [kyselyCodegen.id]: kyselyCodegen,
}
