#!/usr/bin/env bash
set -euo pipefail

cd foundation/atlas
npm ci
npm run typecheck
source ../../.gitlab/atlas-base.sh
npm run godfile-guard
npm run layer-guard
npm run reference-model-guard
npm run spec-conformance-guard
npm run id-integrity
npm run command-doc-guard
npm run wiring-guard
npm run adr-citation-guard
npm run req-clause-guard
npm run ears-coamend-guard
npm run doc-transcript-guard
npm run service-gate-guard
npm run own-snapshot-guard
node --test scripts/materialize-own-snapshot.test.mjs
npm test -- harness/gates/own-snapshot-guard.test.mjs
npm test
