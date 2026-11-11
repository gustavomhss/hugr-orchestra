# Correção mínima de NR1-04

A alteração está concluída na cópia isolada em `s4/producers/runtime-r2/modules/atlas/packages/adapter-io/test/genesis-native-recovery.test.ts`. Ela se destina a R1-J1-01 e, conforme a mensagem do principal, ao finding equivalente J2-R1-01. Não é parecer de aceite nem resultado de teste.

## Mudança

`Sample` passa a carregar `mainStarted` e `mainFinished`. No worker, esses timestamps são registrados imediatamente antes e depois de `runtime.ownership.read(workerData.query)`, antes da chamada independente. A asserção de sobreposição usa agora esse par:

```ts
BigInt(sample.mainStarted) < activation.end && BigInt(sample.mainFinished) > activation.start
```

A condição mantém as desigualdades estritas. A leitura independente continua executada e validada em cada amostra, mas sua duração não integra o intervalo usado para exigir sobreposição de main.

## Preservação verificada estaticamente

O diff contém somente três trechos: campos de `Sample`, posicionamento/nome dos timestamps no worker e campos usados na asserção. Permanecem idênticos os controles NR1-01/02/03, as barreiras Atomics, `waitFor`, limites de tempo e de amostras, validações completas old/new, tratamento HOLD, scope independente e cleanup. O arquivo no candidato e a cópia original preservada continuam byte a byte iguais.

Não foram alterados engine, pipeline, outras condições, corpos L1 ou metadata. Não foram executados testes, typecheck, build, guards ou CI. Commit, CI remoto e nova avaliação continuam com o principal; esta entrega não declara os findings encerrados.

## Proveniência e hashes

Fonte: commit `673b90d82b8b888d5d0184d2e17dec6d5d1b05f1`, caminho `modules/atlas/packages/adapter-io/test/genesis-native-recovery.test.ts`.

| Entrega | Bytes | SHA-256 |
|---|---:|---|
| Arquivo corrigido no mesmo caminho relativo | 23178 | `8e33b9721ef0ea7b8979a696c9493c53d069483d727f64e327c4165341e7bcb4` |
| Original preservado em `original/` | 23146 | `79872860b0734aa1add07519cce558a0314014b5d472d3816857690f296dc387` |
| `change.diff` | — | `8b87831783d2acdabf104a0fbc18218ddb933dddbb106e14a6637e93a069b51f` |
| `request.md` literal | 1624 | `b1ac96827f406f92416ed77c42eeb139abde2f87df3de41159480d6da3f9bd8c` |
| `static-verification.json` | — | `3a807237af5858dc89122122c4b0ee5e8e233e04fbeab6183b1cee5ef46b0f66` |

O Git blob calculado dos bytes corrigidos é `6afce21027c84af72c2e9e02bdda3142933c43a4`; não há commit novo declarado. `mandatory-finding.json` preserva somente o campo autorizado do primeiro parecer; `steering.md` preserva a mensagem sobre o segundo finding. Nenhum oracle, Git remoto ou nova delegação foi utilizado.
