# S3 — proveniência dos oito artefatos superiores

**Escopo:** comparar os oito candidatos superiores registrados pela recuperação `e801b3aef2389d489cc6f9737cdd77a8a78336bd` com os bytes canônicos e os arquivos arquivados no HEAD S3 `68fca8e90c3150416e4e7ef8410df1cc42ee9d1b`. Fonte/protocolo: baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

## Conclusão executiva

- Os oito arquivos em `bodies/` e os respectivos arquivos em `receipts/concurrent-recovery-e801b3a/bodies/` têm o **mesmo Git blob SHA em cada par**. Logo, os bytes atualmente visíveis no caminho canônico são os mesmos bytes da recuperação arquivada; o arquivo de arquivo não é uma variante distinta.
- A reconciliação histórica marca os oito como `conflicts_with_current_output: true` porque conflitam com o output original local da execução principal, não porque o caminho canônico difira do arquivo arquivado.
- O pacote local original da execução principal é relatado em `work.md` apenas por SHA-256 agregado `0f9444211faa6a20ff7d56bd583e784e62b1393708d90c046d2028e95964a400` e candidato `a32c0f65a6126be4ba6fa4c558bd3859598baf64e4bb11401e5dcacc5fe389d4`. Os bytes/manifests por artefato desse payload local não estão publicados nos refs examinados. Portanto **não é possível calcular nem declarar a divergência exata entre cada candidato arquivado e o correspondente original local**.
- `L1-acceptance.json` registra somente os três L1. Nenhum aceite formal L2/L3/L4 foi encontrado nos artefatos examinados. O relato de aceite local em `work.md` não contém os pareceres/bytes individuais necessários para vincular aceite a estes oito SHA-256.
- PASS_STATIC da recuperação é validação mecânica da principal, explicitamente não é julgamento semântico. Findings recuperados são resumo histórico, não decisões J1/J2.

## Matriz por artefato

Todos os caminhos abaixo são relativos a `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/`. O Git blob SHA foi obtido separadamente para o caminho canônico e o caminho arquivado; em cada linha os dois valores são idênticos. Os SHA-256 e tamanhos vêm dos manifestos de recuperação preservados.

| Key | Estado registrado | Bytes | SHA-256 | Git blob (canônico = arquivo) | Aceite encontrado | Próximo passo executável |
|---|---|---:|---|---|---|---|
| s3-l2-maestro | RECONSTRUCTED_NOT_JUDGED | 6,733 | `7505522f3e92fa25dfda8dac896a2717d6eac71d9bd3a928d0bf4ae5e5b08d7e` | `3b22a4c6c25aaf1de7fd1e2b2b26b19950712bbf` | nenhum por este hash | Incluir este corpo no despacho L2-all e obter dois ACCEPT independentes para o hash exato. |
| s3-l2-relay | CORRECTED_NOT_JUDGED | 7,235 | `ebeef855436f687189c081b5a47ade29a2e716b0284613daaa0515f32d333037` | `a0ac19550eef9996ffd3d06561afda2c60272a1f` | nenhum por este hash; finding REC-JUDGE-RELAY-STATUS-01/COST-01 corrigido apenas em validação estática | Julgar junto com todo L2-all; conferir status sprint, UNKNOWN/null custo e reavaliar dependentes após aceite. |
| s3-l2-integrations | RECONSTRUCTED_NOT_JUDGED | 6,833 | `5b65c606ab258eea521adbf0cdf4bdf43b0755ec2ec0a7be5a2efc25545ce0c3` | `93cb6a848dc34cb1c3c6508a1f48a83a4da3db06` | nenhum por este hash | Julgar junto com todo L2-all; não liberar L3 antes dos dois ACCEPT dos três corpos. |
| s3-l3-flows | CORRECTED_CANDIDATE_UNRELEASED | 11,409 | `d69898e99b6e6eb4d9309b46c9e1541059effdbbdcc59fd2efb29ddd860947b7` | `0e0c0d329c836bd3d11c1c15a506650eeec94e7e` | nenhum por este hash | Após aceite L2 pelo mesmo par, submeter este hash e oracle L3 aos dois juízes. |
| s3-l4-entry | CANDIDATE_UNRELEASED | 5,187 | `43dfa1d4d82c7072c911f8e28e6abecce9686f0dea1be7d19077f3d2c27de871` | `6c36fcec6dc798e4c39f321278cf83867fabc723` | nenhum por este hash | Após aceite L3, incluir no despacho L4-all e obter dois ACCEPT para este hash. |
| s3-l4-ownership | CANDIDATE_UNRELEASED | 5,914 | `6c27da488bf8a376b0153150b59584766abd2a8c420910ec9ed542b8c2d4bfa3` | `ee9809e9cce56ee51010169f4c0b8fd208cbc286` | nenhum por este hash | Após aceite L3, julgar junto com L4-all; não inferir ownership operacional de PASS_STATIC. |
| s3-l4-maintenance | CORRECTED_CANDIDATE_UNRELEASED | 7,433 | `31821e9ed5533a9e48fd590fad4bf94373c7a2241615e563038eb27c8b7d0cf8` | `8582b2f4ecb68947bfe550e389ffefe1c3698d6c` | nenhum por este hash; CI/cost findings apenas PASS_STATIC | Após aceite L3, julgar hash exato; exigir evidência literal/run real para CI e manter custo UNKNOWN. |
| s3-l4-operational | CORRECTED_CANDIDATE_UNRELEASED | 7,014 | `4f6a500ee4b575d9c06aa6c070ee8071f3b580c76c0f55da3871e567ebba7d81` | `d7c0157be29cfefd6e649883b446f3894c1a7851` | nenhum por este hash; status/cost/CI findings apenas PASS_STATIC | Após aceite L3, julgar hash exato; distinguir not-run/invalid, exigir run observado e preservar UNKNOWN. |

## Os 21 arquivos da recuperação

O manifesto `evidence/concurrent-branch-reconciliation.json` lista 21 arquivos, todos originados do commit `e801b3aef2389d489cc6f9737cdd77a8a78336bd` e arquivados em `receipts/concurrent-recovery-e801b3a/`:

- **8 corpos** listados na matriz acima; cada um marcado como conflito com o output original local.
- **13 artefatos de suporte** preservados sem conflito de caminho/saída: L2 static validation, recovered judge findings, recovery candidate state, recovery candidate static validation, recovery resume, source excerpts, recovery handoff, dois oracles L3/L4, recovery producer receipt, recovery dispatch, review queue e work.md da recuperação. São evidências de processo e correção; não são aceites.

Os hashes SHA-256/Git blob individuais dos 13 suportes permanecem registrados no manifesto original, blob `e213882427e7b1cb394fdded2b9e5841bfd477c1`. Nenhum arquivo foi alterado nesta reconciliação.

## Divergências e limites efetivamente demonstrados

1. **Caminho canônico versus arquivo arquivado:** nenhuma divergência de bytes; oito de oito Git blob SHAs iguais.
2. **Recuperação versus output original local:** oito conflitos são declarados pelo manifesto contemporâneo da colisão. A comparação de conteúdo/hash com o payload local original não é reproduzível a partir dos refs Git consultados, pois o payload local por artefato não está publicado. Não converter a declaração histórica de conflito em uma diferença de conteúdo quantificada.
3. **Bytes versus aceite:** aceite formal verificável para os oito candidatos: nenhum. O único aceite formal persistido no registro de camada é L1; static validation não substitui dois pareceres.
4. **Correções recuperadas:** Relay L2 mudou de `db289b23c91e8e1dda820f81ed6c2b6a8ebb8844b3ba4d763fb549f363961b79` para `ebeef855436f687189c081b5a47ade29a2e716b0284613daaa0515f32d333037`; L3 flows, L4 maintenance e L4 operational também registram hashes anteriores no manifesto de validação. Essas mudanças exigem julgamento dos bytes corrigidos e invalidam herança de decisão anterior.
5. **Ordem de liberação:** L2-all (três corpos) → L3-flows → L4-all (quatro corpos), sempre com o mesmo par J1/J2 e oracles integrais. O despacho pronto é instrução, não prova de execução.

## Fontes e SHAs

- `work.md`, `native-package.json`, `L1-acceptance.json`, `required-artifacts.json`, `transport-verification.json` no S3 HEAD `68fca8e90c3150416e4e7ef8410df1cc42ee9d1b`.
- `concurrent-branch-reconciliation.json` blob `e213882427e7b1cb394fdded2b9e5841bfd477c1`.
- `recovered-judge-findings.json` blob `be5462bee9bf8e01dfdf8258f12cbad933ea3af1`.
- `recovery-review-queue.json` blob `a960c68db26864c9b8cb863efeacb1392f6c5ecb`.
- `recovery-dispatch.md` blob `b421dcbbf0f5a007cb9705ce22ceb007d13af89c`.
- `L2-static-validation.json` blob `d80b8d02e9c1b3d80d677710d6e39514cafbb3d7`.
- `recovery-candidate-static-validation.json` blob `32e7f9c1e47b3a7a665bd7fb63e43fbaf7e3ae69`.
- Recovery commit `e801b3aef2389d489cc6f9737cdd77a8a78336bd`; original S3 checkpoint `68fca8e90c3150416e4e7ef8410df1cc42ee9d1b`.

**No new semantic acceptance, no original-payload reconstruction, no CI/runtime/product execution, no merge.**
