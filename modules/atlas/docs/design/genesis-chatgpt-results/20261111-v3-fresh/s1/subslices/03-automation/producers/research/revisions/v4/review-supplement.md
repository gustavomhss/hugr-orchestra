# R8.1 — condição de disparo do build detached (v4)

**Observação de fonte.** Esta correção documental responde a ROOT-R-L1-F01. O disparo em `open` depende de `missing && !building && ctx.extract`. `missing` inclui shard ausente ou fallback stale; `building` considera progresso do plano ou build de shard. O retorno building/unavailable pode ocorrer sem novo disparo por esta chamada. A saída inicial quando não há shards precede esse ramo.

**Identidade do delta.** Uma substituição literal na linha 225 de R8.1; demais bytes preservados. V3: 63841 bytes, SHA-256 `f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`, blob `72bdc55fdf2dbda97e84c87111be73fa49aceeb4`; cópia integral em `revisions/v4/history/body.md`. V4: 64106 bytes, SHA-256 `c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`, blob `69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b`. Offsets UTF-8 zero-based, fim exclusivo: BEFORE [35896, 36023); AFTER [35896, 36288). `delta.json` conserva hashes de prefixo/sufixo e verificação inversa; `delta.patch` é o diff unificado independente.

## BEFORE — literal v3

```text
Se não há shard aberto, dispara build detached e devolve building/unavailable com motivo, sem fabricar resultado vazio limpo.
```

## AFTER — literal v4

```text
O build detached exige shard ausente ou stale, ausência de build em andamento do plano ou dos shards e `ctx.extract` disponível (`missing && !building && ctx.extract`). Sem shards no escopo, retorna `index_unavailable` antes desse caminho; sem shard utilizável, devolve building/unavailable com motivo, sem fabricar resultado vazio limpo. Esse erro não implica novo disparo nesta chamada.
```

## RB-S002 — ramo decisivo completo

Fonte original: `packages/core/src/research-toolkit/code-index/query.ts`, commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; captura integral: `sources/packages/core/src/research-toolkit/code-index/query.ts`. Arquivo: 32872 bytes; SHA-256 `ec1dd4a297e6e798c497d67ac5ed21cd4c6484e2aba3c2bed60dbd8f174f05e8`; blob Git `25d652ee0ce78d327427837466b5d7fe5886013f`. Trecho literal contínuo: linhas 176–225 inclusivas, bytes [8891, 12563), 3672 bytes, SHA-256 `d5247bd567dedef70790e07a2ed1a976c147315f0b9a6d954eec438f6b099ec4`. O bloco abaixo conserva os bytes originais do trecho, sem prefixos de numeração; o fechamento do fence é editorial. A identificação RB-S002/E24 mantém o vínculo ao acervo anterior, que permanece integral e inalterado.

```typescript
function open(ctx: Context, plan: CodeIndexBuild.Plan, shards: ReadonlyArray<CodeIndexBuild.Planned>) {
  return Effect.gen(function* () {
    if (shards.length === 0)
      return yield* new Research.Error({ code: "index_unavailable", message: "No supported language with a ready indexer in this scope" })
    const records = yield* CodeIndexStore.records(plan.dir)
    const skipped: Array<{ path: string; reason: string }> = []
    // A shard whose last build in this process failed says why, whether or not an older version serves meanwhile.
    const failed = new Map(shards.flatMap((planned) => {
      const reason = CodeIndexStore.failure(ctx.storeRoot, planned.key)
      return reason === undefined ? [] : [[planned.key, reason] as const]
    }))
    const choices = yield* Effect.forEach(shards, (planned) => Effect.gen(function* () {
      if (yield* CodeIndexStore.exists(plan.dir, planned.key)) return { planned, key: planned.key } satisfies Ready
      const previous = records.flatMap((record) => record.shards
        .filter((shard) => shard.id === planned.shard.id && shard.key !== planned.key)
        .map((shard) => ({ commit: record.commit, key: shard.key })))
      const present = yield* Effect.forEach(previous, (entry) => CodeIndexStore.exists(plan.dir, entry.key))
      const fallback = previous.find((_, index) => present[index])
      const reason = failed.get(planned.key)
      if (reason !== undefined) skipped.push({ path: planned.shard.project, reason: `index-failed: ${reason}` })
      if (fallback) return { planned, key: fallback.key, stale: fallback.commit } satisfies Ready
      if (reason === undefined) skipped.push({ path: planned.shard.project, reason: "index-building" })
      return undefined
    }))
    const missing = choices.some((choice) => choice === undefined || choice.stale)
    const progress = CodeIndexBuild.building(plan.dir)
    const building = progress !== undefined || shards.some((planned) => CodeIndexStore.building(ctx.storeRoot, planned.key))
    // A failed build is retried by the next query that finds the shard still missing; the build is single-flight.
    if (missing && !building && ctx.extract)
      yield* Effect.forkDetach(CodeIndexBuild.build({ ...ctx, extract: ctx.extract }).pipe(Effect.ignore))
    const ready = choices.filter((choice): choice is NonNullable<typeof choice> => choice !== undefined)
    if (ready.length === 0) {
      const cause = [...failed.values()][0]
      if (cause !== undefined && !building)
        return yield* new Research.Error({ code: "index_unavailable", message:
          `Index build failed${ctx.extract ? " (retrying)" : ""}: ${cause}` })
      if (building || ctx.extract)
        return yield* new Research.Error({ code: "index_building", message:
          `Index is building: shardsDone ${progress?.shardsDone ?? 0} of shardsTotal ${progress?.shardsTotal ?? shards.length}` +
          (cause === undefined ? "" : `; last attempt failed: ${cause}`) })
      return yield* new Research.Error({ code: "index_unavailable", message: "Index has not been built for this commit" })
    }
    if (!missing) yield* CodeIndexStore.touch(plan.dir, plan.commit)
    const stale = [...new Set(ready.flatMap((choice) => choice.stale ? [choice.stale] : []))]
    const changes = new Set((yield* Effect.forEach(stale, (from) => CodeIndexShard.changed(ctx.git, from, plan.commit))).flat())
    ready.filter((choice) => choice.stale).forEach((choice) =>
      choice.planned.shard.files.filter((file) => changes.has(file)).forEach((file) => skipped.push({ path: file, reason: "changed-since-index" })))
    return yield* overlay(ctx, plan, ready, skipped)
  })
}
```

**Limite.** A base é inspeção estática do baseline fixado. Nenhum build, teste de produto ou chamada externa foi executado. A verificação de bytes não é um parecer de suficiência semântica.
