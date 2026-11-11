# Fatia 5 — CLI, Omni, distribuição, infraestrutura e contratos transversais

## Sumário

[Identidade](#identidade-e-início-independente) · [Domínio](#domínio-próprio-e-fronteiras) · [Execução](#execução-completa) · [Juízo](#dois-juízes-e-consumidores-locais) · [Critérios](#critérios-e-provas) · [Entrega](#saídas-e-entrega-a-root).
Aplicar [campanha](campaign.md), [juízo](judging.md), [runtime](runtime.md), [handoffs](handoffs.md) e [partição](parallel-partition.json).

## Identidade e início independente

- Repositório: `gustavomhss/hugr-orchestra`; fatia `S5`.
- `campaign`: `20261111-v1`; `protocol_epoch`: `parallel-v2`.
- `results_epoch`: `20261111-v2-parallel`; branch preservada: `genesis-chatgpt-s5`.
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; registrar o commit real do kit.
- Saídas: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/s5/`.
- Registrar fonte, HEAD efetivo, candidato, protocolo e hashes distintos conforme `handoffs.md`.
- `integration_owner`: `root` (conversa original); branch integradora reservada: `genesis-chatgpt-final`.
- Integração reservada a ROOT: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/integration/`.

Iniciar inventário, todas as camadas, dois juízes, correções e consumidores do próprio domínio imediatamente.
S5 executa somente seu domínio completo e entrega a ROOT, conforme a decisão explícita do proprietário.
Não esperar inventário S1, implementação S4, julgamento ROOT ou handoffs S1–S4 para produzir e julgar S5.
Não atuar como aprovador prévio das outras sessões nem como integrador final da união.

## Domínio próprio e fronteiras

Aplicar `parallel-partition.json`; conferir **927 entradas**, incluindo o fallback explícito S5 de **225 entradas**.
Hash de caminhos: `7d807d18a0bbbcccbaa1f01954b78036a2769c5fee95a1e8be5293435ec714f0`.
Cobrir `apps/cli`, `native/omni`, `nix`, `packages/script`, patches, perf, configuração raiz e infraestrutura transversal.
Cobrir scripts/CI restantes, docs globais, guardrails e outros caminhos atribuídos pelo resolvedor, sem omitir o fallback.
As exceções Atlas de scripts/workflows pertencem a S4; HTTP tooling pertence a S1; Storybook pertence a S2.
Classificar gerados, lockfiles, configurações, documentação histórica e assets sem os declarar fora do inventário.
Ler quaisquer fontes do baseline para fronteiras; não esperar artefato alheio para entender uma API ou contrato.
Ser owner de documentação transversal significa produzir conhecimento sobre ela, sem autoridade sobre todos os módulos.

Ler `AGENTS.md`, skills Atlas aplicáveis e fontes normativas de `campaign.md`, incluindo landing e reconciliação histórica.
Inventariar CLI/configuração, Omni, artefatos nativos, distribuição, Nix, CI, guards e políticas de release existentes.
Distinguir receita/versionamento, código do workflow, run observado, entrega e ativação; nenhuma etapa implica outra.
Distinguir ownership do conhecimento de CI/distribuição de autorização para disparar release ou alterar produção.

## Escrita e retomada

Preservar branch, commits, manifests e juízos v1; reutilizar somente objetos/hashes e bindings compatíveis.
Não reiniciar filas antigas, eliminar decisões, zerar uso desconhecido nem duplicar tentativas sem estado resolvido.
Identificar preparações globais v1 de S5 e entregar suas refs exatas a ROOT, preservando o alcance original.
Não reapresentar essas preparações como integração `parallel-v2` aceita nem retomar o papel antigo de gate central.
Escrever resultados próprios em `s5/`; não editar namespaces de evidência S1–S4 nem o namespace `integration/`.
Corrigir somente código mínimo diretamente necessário ao Genesis em candidato isolado dos componentes S5.
Não esperar liberação global ROOT para mudança própria; contratos compartilhados exigem proposta e coordenação com o owner.
Não assumir todos os stores, exports ou contratos por decreto; não inferir merge, produção, release ou limpeza destrutiva.

## Execução completa

1. Verificar capacidades, fonte e estado; enumerar as 927 entradas e revisar explicitamente os 225 itens de fallback.
2. Congelar necessidades → artefatos → fontes → casos → critérios de CLI, Omni, build/distribuição e controles transversais.
3. Preservar separação entre código executável, intenção documentada, configuração, receitas e resultados históricos.
4. Planejar produtores disjuntos pela capacidade real e reservar dois juízes locais; não prometer concorrência não observada.
5. Produzir L1 atribuído ao baseline com fontes, autoridade, limites, lacunas e respostas originais preservadas.
6. Submeter a camada completa do escopo aos dois juízes; corrigir achados antes de liberar a camada seguinte.
7. Produzir L2 componentes, L3 fluxos e L4 ownership/manutenção cumulativos, mantendo intermediários úteis e aceitos.
8. Preparar casos de alteração CLI/configuração, incompatibilidade de artefato, falha de distribuição, quebra de guard,
   impacto sobre domínio vizinho e pergunta fora do escopo; manter oracle separado do produtor e do consumidor.
9. Executar consumo Atlas pelo caminho real disponível e autorizado, registrando índices, leituras, limites e recusas.
10. Preparar/coletar gates reais aplicáveis no candidato exato; não executar testes locais sem autorização explícita.
11. Corrigir bindings afetados e reavaliar com os mesmos juízes, preservando o trabalho aceito e tentativas incertas.
12. Publicar handoff próprio para ROOT; quando faltarem publicação/CI/runtime, concluir o trabalho independente e nomear a prova pendente.

## Dois juízes e consumidores locais

Criar J1 de fidelidade/autoridade e J2 de completude/utilidade em contexto independente do produtor desta sessão.
Registrar IDs reais e reusar o mesmo par em correções; ambos cobrem os critérios locais aplicáveis no candidato exato.
Nenhum juiz edita/corrige candidato ou oracle; nenhum terceiro voto, maioria ou parecer do coordenador libera uma camada.
Exigir dois PASS válidos na versão pertinente; manter HOLD e pedidos de evidência como decisões ainda abertas.
Os dois juízes S5 avaliam o domínio S5; ROOT criará seu próprio par `integration/J1` e `integration/J2` para a união final.
Não migrar IDs entre chats nem apresentar reviewers históricos ou locais como juízes da integração por simples renomeação.
Executar consumidores separados do oracle, com acesso delimitado ao índice/leitor Atlas real quando suportado.
Registrar leitura raso/profunda e uso direto dos intermediários; texto útil fora do reader não fecha AC-03.
Se faltar isolamento, reader ou autorização de execução, identificar o requisito exato e seguir nas partes independentes.

## Critérios e provas

Inventariar AC-01..10, CC-1..7, SC-1..5 e DOD-1..7 para S5, com aplicabilidade, evidência, desconhecidos e dependências.
Aplicar GO-A1..7, GO-I1..8 e QS-1..6; conhecimento transversal não permite marcar critérios repo-wide como concluídos.
AC-01/CC-1 exigem cobertura finita S5 e explicação do fallback; AC-02/03 e SC-1/2 exigem consumidores reais e úteis.
AC-04..06/CC-2..4/SC-3 exigem construção, rejeição, reuse e atualização observados onde aplicáveis ao domínio.
AC-07/09/10, CC-5/7 e SC-5 exigem consistência, recuperação, callers e preservação/migração relevantes e comprovados.
AC-08/CC-6/SC-4 requerem ledger próprio, incluindo juízes e correções; métricas ausentes permanecem `UNKNOWN`.
DOD-1..7 requerem decisões locais explícitas e vínculos com gates/autoridade; aprovação técnica não fabrica aceite humano.
Um workflow existente, YAML válido ou log antigo não comprova CI verde do candidato corrente.
Registrar gates não executados como pendência precisa, sem paralisar produção e julgamento independentes.

## Saídas e entrega a ROOT

- `inventory.json`, `needs.json`, `acceptance-map.json`: população S5, fallback, fronteiras e necessidades locais.
- `layers/`, `recipes/`, `manifests/`: L1–L4, fontes, corpos, receipts e dependências de cada candidato.
- `judge-roster.json`, `judgments/`, `corrections/`: dois juízes locais, decisões por versão e resolução dos defeitos.
- `consumer-cases/`, `evidence/`, `criteria.json`: consultas, provas executadas, gates e obrigações ainda abertas.
- `reuse-ledger.json`, `execution-ledger.jsonl`, `proposals/`: continuidade v1, uso, tentativas incertas e deltas necessários.
- `integration-inputs.json`: refs verificáveis das preparações globais v1 úteis a ROOT, sem declarar nova aceitação global.
- `handoff.json`: estado e bindings conforme `handoffs.md`, distinguindo produzido, julgado e efetivamente executado.

Entregar commits/paths/hashes a ROOT e encerrar o domínio no alcance demonstrado; não esperar o fim de S1–S4.
ROOT compõe a união na branch/prefixo reservados e julga com seu par independente; S5 responde a correções de seu owner scope.
Informar cobertura, camadas julgadas, consumidores, incertezas e próximo passo concreto de cada obrigação restante.
