# Pacote portátil — evidência da fatia pura

**Integrado em 2026-11-05; não é handoff autorizado nem entrega integral de S12/T21/J07.** Requisitos canônicos permanecem inalterados. Escopo decidido em [PORTABLE-WAVE.md](./PORTABLE-WAVE.md).

## Código e contratos

- `FabricWorkspace.Package` é um envelope fechado/readonly com documento canônico, origem opcional, revisões usadas, hints não resolvidos e sete marcadores obrigatórios de exclusão. Nenhum campo de conexão, grant, ambiente, aprovação ou resultado é aceito.
- `@orchestra/fabric/package` fornece `encode(input, catalog, limits?)` e `decode(text, catalog, limits?)`. Ambos compilam o workspace pelo compilador existente, rebaseiam diagnósticos/normalizações e validam aliases e conjuntos exatos de revisões. Encode deriva metadados; decode recusa refs ausentes/extras/repetidas, mesmo quando o catálogo as conhece.
- O motor privado `BoundedJson` compartilha o algoritmo anterior sem duplicá-lo. Perfis trusted: workspace 262144 bytes/profundidade 16; package 524288/17. Os wrappers públicos continuam fixos em workspace e overrides só reduzem limites. O codec readmite o output antes de serializar dados já admitidos.
- Metadata tem ordem determinística, refs usam ordenação UTF-16 sem locale e hints preservam ordem da lista. Conteúdo pessoal de props/args/documento é preservado. O texto não é JCS, assinatura, autenticação de origem ou detector semântico de segredos.

Branch publicada `fabric-portable` @ **`9063c3d1daa83adc0cde0a3c756976ae20626bf3`**. Scaffold/wire/seams `641f77bbc7`; integração motor `d2df41aa59`, codec `8c6921fc80`, testes de perfis `9063c3d1da`. Fontes dos autores preservadas em `fabric-engine` @ `b07cc661a3ca7c4713dabb243c359a155b14ccb7` (draft PR #1325) e `fabric-codec` @ `de5f6f682479a61a628ee86a6b5b3fa4258f735c` (draft PR #1326). Nenhuma PR foi mesclada em dev nem houve release/restart/chamada Fabric autenticada.

Documentação de entrypoints/limites publicada depois em `4c3815ff4bef383d91dda919315ac6c694ffa9bb`, sem alteração dos fontes gateados. Worktrees dos autores removidos limpos após preservar os overlays conhecidos do lead; branches e evidências continuam recuperáveis.

## Aceitação, revisão e CI

PKW01–04 e PKG01–04 foram escritos antes da implementação. RED v7: [41966277262](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41966277262) atingiu os quatro casos wire por Package ausente; [41966446613](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41966446613) atingiu os quatro casos codec por módulo ausente. Duas críticas sequenciais secas encerraram a cobertura v7. V8 só estreitou dois literais de tipo e incluiu o seam PackageResult; as asserções runtime v7 não mudaram.

Wire/seams, extração e codec receberam revisão estática independente em checkouts isolados. Testes suplementares de perfis também foram revisados e fortalecidos antes do gate combinado final. Hooks Relay não foram demonstrados e não contam como prova de execução.

| Gate | Resultado observado e conferido pelo lead |
| --- | --- |
| Schema após restore | [41967348798](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41967348798), snapshot `6452d7b29b5ff102b57e3d0d36dab427fe487de7`: **17 pass, zero fail, 546 expectations**; PKW/DEC/FND/higiene. |
| Fabric combinado final | [41969827907](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41969827907), snapshot `0e29a1fe8138588da91e9db95968db344d7089aa`: **21 pass, zero fail, 3638 expectations**; PKG/PRFv2/PAR/CMP/ADV/SEAM. |
| Typecheck | Schema e Fabric, local e na combinação real. Prova estática, não substitui CI runtime. |
| Boundaries/guards | 94 violações históricas ledgered, zero novas/stale; zero gate findings, sete warnings de dependências previamente justificadas. Nenhum ignore/ledger/gate foi relaxado. |

Lead recuperou fontes/testes dos snapshots e comparou **todos os hashes** do candidato final, além de confirmar cada caso nomeado. Manifest imutável `fs-portable-candidate-v1/manifest.json`, SHA-256 `5f5df9aa5dd4881273d0c3cfd7fdd7b97cf165af3e9e68a250f6131644bcdbd0`, no temporário aprovado. A árvore principal recebeu esses mesmos bytes, preservando o corpus/manifests não commitados. Isso não depende apenas do retorno dos autores.

## Contraprovas reais, todas restauradas

| Defeito introduzido | Falha observada |
| --- | --- |
| Credenciais aceitam false; lista de componentes aceita 25 refs distintos | [41967132521](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41967132521): PKW02 e PKW03 nos respectivos asserts; Schema voltou a passar após restore. |
| Hint público mutável | Typecheck local falhou na asserção readonly PKW01; bytes restaurados e typecheck voltou a passar. Não é teste de comportamento. |
| Troca de seleção workspace/package | [41967845657](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41967845657): PAR04/PRF01/PRF02 falharam primeiro no workspace elevado. Não foi contado como prova da perna package reduzida. |
| Somente package reduzido para 256 KiB/16, workspace normal | [41969628062](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41969628062), snapshot `d56e5a853940542ab67a2cfe7c4edbfac348c7f0`: PRF01/PRF02 passaram pelos controles workspace e falharam no package. Restore exato precedeu o gate final de 21 testes. |
| Omitir igualdade dos manifests importados e ignorar override menor no output | [41968869694](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41968869694): PKG02/PKG03 falharam por manifesto incompleto e expansão além do limite menor; restore [41969136459](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41969136459) passou e o gate do lead confirmou a mesma combinação. |

Fixtures usam tamanhos moderados e dados sintéticos; não houve experimento GiB, credencial real ou execução de callbacks hostis. Limites de admissão não são garantia de memória total nem sandbox de um realm JavaScript arbitrário.

## O que permanece fora desta prova

O pacote não cria contexto salvo, autenticação, proteção de rascunhos, preview/consentimento de compartilhamento, download autorizado, rebind do destinatário ou atualização de templates. Exclusions não transforma conteúdo pessoal em dado público. Os dezoito templates, UI nativa, catálogo/adaptadores, identidade/CAS/proteção, consultas/resultados, comandos/jobs, checks, IA e qualificação real continuam nos gates de [DELIVERY.md](./DELIVERY.md); nenhuma indisponibilidade/fixture/handoff encerra a tarefa real.
