# Fatia 4 — Atlas, conhecimento, continuidade, RAG e Genesis

## Sumário

[Identidade](#identidade-e-início-independente) · [Domínio](#domínio-e-fronteiras) · [Runtime](#adapter-importer-e-recuperação) · [Execução](#execução-completa) · [Critérios](#critérios-e-provas) · [Entrega](#saídas-e-encerramento).
Aplicar [campanha](campaign.md), [juízo](judging.md), [runtime](runtime.md), [handoffs](handoffs.md) e [partição](parallel-partition.json).

## Identidade e início independente

- Repositório: `gustavomhss/hugr-orchestra`; fatia `S4`.
- `campaign`: `20261111-v1`; `protocol_epoch`: `parallel-v2`.
- `results_epoch`: `20261111-v2-parallel`; branch preservada: `genesis-chatgpt-s4`.
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; registrar o commit real do kit.
- Saídas: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/s4/`.
- Registrar fonte, HEAD efetivo, candidato, protocolo e hashes distintos conforme `handoffs.md`.
- `integration_owner`: `root` (conversa original); branch integradora reservada: `genesis-chatgpt-final`.
- Integração reservada a ROOT: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/integration/`.

Começar inventário, L1–L4, juízo e correções próprios sem esperar S1, S5 nem outro domínio.
S4 também implementa a capacidade Atlas diretamente necessária ao Genesis; essa atividade não suspende a produção nativa.
As outras fatias podem produzir e julgar enquanto o binding/importer estiver pendente, sem alegar publicação fictícia.

## Domínio e fronteiras

Aplicar o resolvedor de `parallel-partition.json`; conferir **2.220 entradas** atribuídas a S4.
Hash de caminhos: `0b99735199c8a9a4db61bf506dafe92acb76909dd9f9c48d8f521fb920c6cd1d`.
Incluir `modules/atlas`, `modules/continuity`, `modules/rag-studio`, `.atlas/`, `script/atlas-genesis/`,
`script/atlas-baseline.mjs`, `specs/atlas-ui/` e docs/skills/workflows Atlas exatos atribuídos no manifesto.
Cobrir conhecimento, captura, autoridade, CAS/receipts, reader/index, rebuild, recuperação e fronteiras RAG/continuidade.
Classificar documentação histórica, harnesses, fixtures e código interno sem confundi-los com aceites atuais.
Ler quaisquer fontes do baseline de outros domínios para contrato/caller, sem esperar resultados de outra sessão.

Ler `AGENTS.md`, skills `atlas-usage`, `atlas-maintenance`, `atlas-ownership` e os contratos normativos de `campaign.md`.
Inspecionar `modules/atlas/scripts/ownership-pilot.ts`, os tipos existentes e os seams reais de input/rebuild/read/recovery.
O piloto Session-input tem população, receitas e reviewers históricos próprios; não generalizá-lo trocando IDs ou labels.

## Escrita e retomada

Inspecionar as branches preservadas e localizar por commit/path/blob os patches e recibos v1 de S2, S3 e S4.
Reconciliar producer/importer/rebuild de S2, recuperação/publicação de S3 e host/migração de S4 antes de implementar.
Reutilizar objetos compatíveis; aplicar somente deltas necessários no candidato S4, sem cherry-pick amplo não inspecionado.
Preservar autoria, versões e tentativas incertas; não apagar história, zerar uso ou reenviar pedido sem resolver sua identidade.
Escrever resultados novos em `s4/`; mudanças de produto limitam-se ao mínimo necessário ao Genesis sob ownership S4.
Implementar em candidato isolado sem esperar liberação global ROOT; contratos de outros donos exigem proposta/coordenação.
Não editar policies, permissões ou reviewers históricos para contornar uma recusa nem ativar produção automaticamente.

## Adapter, importer e recuperação

Implementar/reutilizar o adapter genérico de respostas nativas nos tipos e portas existentes, conforme `runtime.md`.
Preservar bytes originais, fontes, autoridade, receita, dependências, reviews reais, receipts e identidade de resultado.
Aceitar múltiplos scopes/domínios pelo contrato governado; não criar store, autoridade ou leitor paralelo para research.
Distinguir staging, validação, publicação autorizada e readback; só a observação da porta real comprova cada passagem.
Rebuild deve capturar inputs, selecionar afetados, consumir predecessores e gerar candidato verificável até o estágio permitido.
Exercitar cache sem nova interpretação, edit/add/remove/intent-doc/recipe e preservação de independentes quando autorizado.
Recuperação deve preservar concorrência, journal, interrupção, retomada, HOLD, rollback e compatibilidade observáveis.
Reader/index devem respeitar projeção, trust, limite, versão e recusas reais; acesso direto a arquivo não substitui o reader.
Quando execução depender de CI, preparar evidência e gates sem testes locais não autorizados; declarar `not_run` até observar.
Entregar o adapter/candidato por commit e contrato; nenhuma descrição ou fixture fixa prova que ele já executou semanticamente.

## Execução completa

1. Confirmar capacidades, fonte, materialização e ledger; congelar população S4 sem depender de inventário S1.
2. Mapear necessidades → artefatos → fontes → casos → critérios, incluindo internos Atlas e consumidores RAG/continuity.
3. Separar artefatos de conhecimento sobre Atlas da implementação do adapter; ambos têm autoria e evidência próprias.
4. Produzir L1 atribuído com originais e lacunas; verificar cobertura e entregar aos dois juízes persistentes locais.
5. Corrigir achados e liberar L2 apenas após dois PASS no predecessor obrigatório do escopo.
6. Repetir para L2 componentes, L3 fluxos e L4 manutenção/ownership, mantendo todos os intermediários necessários.
7. Usar os mesmos J1 fidelidade/autoridade e J2 completude/utilidade nas revisões, sem autoria, terceiro voto ou PASS fabricado.
8. Congelar oracle separado para mudanças de contrato, corrupção/autoridade, impacto, recuperação e pergunta fora do escopo.
9. Executar consumidores Atlas-only quando o caminho estiver disponível e autorizado; registrar índices, leituras e limites.
10. Provar uso direto de intermediários e aprofundamento; qualquer falha de isolamento/readback conserva a obrigação aberta.
11. Corrigir o conjunto afetado e reavaliar bindings; não reexecutar irmãos aceitos nem atribuir o juízo ao integrador.
12. Disponibilizar conhecimento, código candidato e provas por commits independentes, permitindo o trabalho dos demais domínios.

## Critérios e provas

Inventariar AC-01..10, CC-1..7, SC-1..5 e DOD-1..7 para S4 e suas responsabilidades transversais de runtime.
Aplicar GO-A1..7, GO-I1..8 e QS-1..6 com evidência por linha, sem aprovação por inventário ou schema válido.
AC-01/CC-1 requerem cobertura S4; AC-02/03 e SC-1/2 requerem consumidores reais e intermediários alcançáveis.
AC-04/05/06, CC-2..4 e SC-3 exigem producer/importer, recusas, reuse e rebuild reais em candidatos identificados.
AC-07/09/10, CC-5/7 e SC-5 exigem recuperação, caller/trust, migração, recusa do produtor antigo e preservação.
AC-08/CC-6/SC-4 exigem ledger completo e limites honestos do host; medidas ausentes permanecem `UNKNOWN`.
DOD-1..7 dependem também de CI, integração e autoridade quando aplicáveis; recibo preparado não comprova execução.
Não executar testes locais sem autorização explícita; manter gates reais pendentes sem paralisar produção/julgamento próprio.
Dois juízes aceitam a versão exata de cada camada e candidato aplicável; green mecânico não substitui aceite semântico.

## Saídas e encerramento

ROOT cria seu próprio par `integration/J1` e `integration/J2`; os dois juízes locais não assumem a integração final.

- `inventory.json`, `needs.json`, `acceptance-map.json`, `layers/`, `recipes/`, `manifests/`: população e L1–L4 de S4.
- `adapter-contract.md`, `proposals/`, `evidence/`: código/candidato, conformance, importer, readback, rebuild e recovery reais.
- `reuse-ledger.json`: origem exata de cada patch v1 S2/S3/S4, equivalência, aplicação, descarte justificado e deltas.
- `judge-roster.json`, `judgments/`, `corrections/`, `consumer-cases/`: autoria separada, duas decisões e consumo observado.
- `execution-ledger.jsonl`, `criteria.json`, `handoff.json`: uso, incertezas, gates e bindings conforme `handoffs.md`.

Não declarar o repositório publicado, recoverable ou concluído apenas porque os arquivos e adapter foram preparados.
Preservar produtos nativos julgados enquanto uma passagem runtime/CI/autoridade estiver aberta e nomear seu próximo passo.
Entregar a ROOT candidato reutilizável, contratos, provas efetivas e limites explícitos; nenhum handoff reinicia as outras fatias.
