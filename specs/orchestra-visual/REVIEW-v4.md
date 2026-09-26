# Revisão e reparos v4 — contrato, não produto

## Veredito delimitado

Os dez bloqueadores R01–R10 e os três reforços H01–H03 da auditoria v3 receberam correções no contrato e nas ferramentas, com regressões positivas/negativas. O contrato permite iniciar S01 e executar o DAG corrigido. Isso NÃO aprova um frontend, uma capacidade live, uma imagem de implementação ou um budget já alcançado.

A imagem aprovada não foi modificada. Não foi adicionado épico, issue nem subissue. Foi adicionado um WP com duas tasks no mesmo integrador S25: 143 nós,38WPs,66tasks. Os cinco axiomas continuam explícitos em cada nó; 1.936 critérios identificados. A quantidade não substitui a coerência de cada obrigação.

## Reparos e prova

| ID | Correção | Regressão exigida |
|---|---|---|
| R01 | Estágios e axiomas de produtor/gates/encerramento separados; T1 não exige S23/S24 futuros; criterion_evaluation_stage e acceptance_requires verificados. | `test_repairs` — casos `R01`; detalhes em FINDINGS-RESOLUTION.json. |
| R02 | Adicionado S25-W0 com duas tasks do mesmo integrador; piloto tem15 pré-requisitos e precede home/settings/providers/Janitor completos. | `test_repairs` — casos `R02`; detalhes em FINDINGS-RESOLUTION.json. |
| R03 | PLAN/SURFACES/CENSUS canônicos, mapas/projeções derivados; escopo de sidebar e classificações migrate/inherit/out-of-scope; censo --repo strict reprova arquivo novo não classificado. | `test_repairs` — casos `R03`; detalhes em FINDINGS-RESOLUTION.json. |
| R04 | Lease serial com paths de registro e os dois prefixes generated, comando oficial e idempotência. Live exige confirmação do footprint local por S01; saída fora do grant não passa. | `test_repairs` — casos `R04`; detalhes em FINDINGS-RESOLUTION.json. |
| R05 | Manifesto efetivo inclui task, regras contínuas dos ancestrais, normas, cobertura, fixture/master e leases; notas não normativas e outros owners não invalidam automaticamente. | `test_repairs` — casos `R05`; detalhes em FINDINGS-RESOLUTION.json. |
| R06 | Descoberta e piloto são milestones históricos; provas locais observam outputs; gates finais observam todo produto. Cone potencial não é reset global e reparos continuam selecionáveis. | `test_repairs` — casos `R06`; detalhes em FINDINGS-RESOLUTION.json. |
| R07 | Baseline pré-task, faixa Git completa e diff real; dirty/index preexistentes preservados; imports do integrador exigem receipts e versão exata do produtor. | `test_repairs` — casos `R07`; detalhes em FINDINGS-RESOLUTION.json. |
| R08 | Vagas=max(0,jobs-running); não cancelar excesso anterior, reportar over_capacity e não alocar; preservar conflitos/host quieto. | `test_repairs` — casos `R08`; detalhes em FINDINGS-RESOLUTION.json. |
| R09 | Prova externa atual vinculada a fonte ancestral ou artefato instalado+lockfile, logs públicos positivos/negativos, revisão e hashes; --repo obrigatório. | `test_repairs` — casos `R09`; detalhes em FINDINGS-RESOLUTION.json. |
| R10 | Manifesto canônico de superfície/estado/viewport/DPR/zoom/host/build/fixture/master; dimensões e cobertura completa conferidas antes da revisão estética. | `test_repairs` — casos `R10`; detalhes em FINDINGS-RESOLUTION.json. |
| H01 | Avaliador determinístico de observações A/B implementado e recalculado pelo validador; budgets, mínimo de amostras, ambiente, unidades e estados inconclusivos controlados. | `test_repairs` — casos `H01`; detalhes em FINDINGS-RESOLUTION.json. |
| H02 | Arrays fechados de gates, identidade do release, tipos, duplicatas e cobertura obrigatória verificados no plano. | `test_repairs` — casos `H02`; detalhes em FINDINGS-RESOLUTION.json. |
| H03 | PNG verificado por CRC/chunks/IDAT/IEND, zlib completo e scanlines dentro de limites; truncamento/payload/CRC/filter inválidos recusados. | `test_repairs` — casos `H03`; detalhes em FINDINGS-RESOLUTION.json. |

## Revisão semântica adicional

A aprovação de um agregado foi distinguida dos invariantes contínuos herdados. Não basta todo nó ter cinco headings: a task produtora deve conseguir terminar com evidências que já existem nesse estágio.

O primeiro piloto depende de15 tasks, não44. Usa controllers existentes e a fundação real. S06/S15 verificam a composição conectada após o candidato W0, sem exigir W1 completo. O piloto checa macrocomposição, foco, scroll e custo inicial; todos os microdetalhes e telas ainda precisam passar no gate final. Não é desculpa para encerrar no piloto.

Durante a reauditoria dos reparos foram corrigidos mais quatro casos de coerência dentro dos achados originais: consumo prematuro de S13 pelo container de settings; implementação do Dock/overlays antes da bridge contratada; atribuição de merges de outros owners; e a possibilidade de DELIVERY.md posterior apagar o milestone histórico do piloto. São extensões de R01/R02/R06/R07, não uma alegação de novos bugs do aplicativo.

## Provas executadas e limites

A suíte v3 original passou83 testes antes dos reparos. A suíte v4 passou133 testes ÚNICOS: os83 anteriores com fixtures adaptadas ao contrato revisado e50 regressões adicionais. A lista de IDs foi verificada para não contar TestCases importados duas vezes. Nenhum teste do Orchestra, medição de performance real ou Electron foi executado.

As fixtures de Git, métricas, capturas e API são explicitamente sintéticas. Imagens completas sintéticas provam regras de cobertura e decodificação, não estética. As observações A/B sintéticas provam o avaliador, não latência real. A função imported_grants testa merges reais em Git temporário, não no repositório do usuário.

A caminhada do DAG cobre produção do piloto, frentes independentes, candidato integrado, gate falho, repetição e fechamento. Provas de fonte complementares cobrem output alterado, milestone histórico, mudança de contrato, dirty/index preexistentes, rename e import com conflito não autorizado. Revisão feita pelo mesmo assistente em passagem fria; não é revisão externa independente.

O censo completo do checkout real permanece pré-condição executável de S01. O comando oficial de geração foi confirmado por leitura no repositório (client/package.json e script/build.ts, com os destinos generated/generated-effect); sua execução real e footprint local devem ser confirmados antes de W2. O plano não pré-aprova essa verificação. Nenhuma fonte proprietária foi incluída.

## O que o tooling não promete

Não autentica o executor contra adulteração coordenada de contrato+logs+testes. Não decide beleza. Não verifica fisicamente todo estado do computador por um campo quiet_host. Não detecta sozinho toda UI dinâmica apenas por listar TSX/CSS; S01 também percorre imports/rotas/exports e classifica fontes nativas. Não transforma issue fechada em autoridade operacional. Evidência real e revisão continuam obrigatórias.

## Reproduzir

```sh
python3 tools/validate_plan.py
python3 tools/render_maps.py --check
python3 tools/render_issues.py --check
python3 -m unittest discover -s tools -p 'test_*.py' -v
python3 tools/select_work.py
python3 tools/github_sync.py --offline
```

Com checkout real: adicionar --repo ao seletor e validador de recibos; usar --census-strict antes de aprovar S01. O pacote mantém zero tasks de implementação em PASS.
