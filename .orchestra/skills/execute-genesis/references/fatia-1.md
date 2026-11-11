# Fatia 1 — core, sessões, modelos e contratos de API

## Sumário

[Identidade](#identidade-e-início-independente) · [Domínio](#domínio-e-fronteiras) · [Execução](#execução-completa) · [Juízo](#dois-juízes-e-consumidores-locais) · [Critérios](#critérios-e-provas) · [Entrega](#saídas-e-encerramento).
Aplicar [campanha](campaign.md), [juízo](judging.md), [runtime](runtime.md), [handoffs](handoffs.md) e [partição](parallel-partition.json).

## Identidade e início independente

- Repositório: `gustavomhss/hugr-orchestra`; fatia `S1`.
- `campaign`: `20261111-v1`; `protocol_epoch`: `parallel-v2`.
- `results_epoch`: `20261111-v2-parallel`; branch preservada: `genesis-chatgpt-s1`.
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; registrar o commit real do kit.
- Saídas: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/s1/`.
- Registrar fonte, HEAD efetivo, candidato, protocolo e hashes distintos conforme `handoffs.md`.
- `integration_owner`: `root` (conversa original); branch integradora reservada: `genesis-chatgpt-final`.
- Integração reservada a ROOT: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/integration/`.

Começar inventário, produção L1–L4 e julgamento desta fatia imediatamente a partir do baseline.
Não esperar inventário global, liberação de ROOT nem artefato produzido por outra sessão.
Esta fatia não prepara as outras: entrega ownership completo do próprio domínio.

## Domínio e fronteiras

Usar exclusivamente o resolvedor de `parallel-partition.json`: arquivo exato, prefixo mais longo, fallback S5.
Conferir **2.236 entradas**, com hash de caminhos `67d80c0e398b495140ef3b9fd4d0a8058036290919856635298b9007ed153889`.
O mapa inclui `packages/core`, `llm`, `server`, `protocol`, `schema`, `client`, `sdk-next`, `plugin`,
`codemode`, `effect-drizzle-sqlite`, `effect-sqlite-node`, os dois componentes `tooling/http*` e `schema/config.json`.
Incluir testes/configurações internos e os guias, skills, specs e briefs exatos atribuídos pelo manifesto.
Não ampliar o conjunto por busca de palavras como core, API ou session em caminhos de outros donos.
Ler qualquer fonte do baseline para entender chamadas, consumidores e fronteiras, registrando sua proveniência.
Distinguir contratos públicos e fontes externas consultadas de artefatos primariamente produzidos por S1.

Ler `AGENTS.md`, as skills Atlas aplicáveis e os contratos normativos relacionados em `campaign.md`.
Investigar sessões, entrada e processamento, rotas de modelos, ferramentas, plugins, protocolo/API e persistência.
Relacionar limites de autoridade/permissão, cancelamento, erros, compatibilidade, armazenamento e consumers reais.
Não assumir que Session-input aceito anteriormente explica todos esses componentes ou suas versões atuais.

## Escrita e retomada

Preservar a branch existente; começar por inspecionar commits, handoffs e tentativas já registradas.
Reutilizar v1 apenas por objetos, hashes, fontes, receita e critérios compatíveis; preservar decisões originais.
Não apagar resultados, reiniciar filas, zerar uso desconhecido nem duplicar emissão cuja liquidação seja incerta.
Escrever evidências novas somente em `s1/`; propor mudanças externas ao domínio para seu owner explícito.
Aplicar somente mudanças mínimas de código diretamente necessárias ao Genesis em candidato isolado de S1.
Não esperar liberação global de ROOT para uma correção própria; preservar contratos e publicar o delta verificável.
Contratos compartilhados exigem proposta e coordenação com o dono; a partição não autoriza uma refatoração geral.

## Execução completa

1. Verificar leitura, escrita, persistência e subagentes reais; registrar capacidades ausentes sem inventar IDs.
2. Enumerar os caminhos S1 e classificar código, testes, gerados, fixtures, docs e configurações sem perder entradas.
3. Inventariar necessidades concretas por componente/fluxo e ligar necessidade → fonte → artefato → caso → critério.
4. Congelar escopos, autoridade, lacunas permitidas, dependências e limites de consumo antes da avaliação.
5. Planejar produtores disjuntos na capacidade observada, reservando espaço para dois juízes persistentes.
6. Produzir L1 atribuído a fonte; separar comportamento, intenção, inferência e lacuna sem fabricar observação.
7. Consolidar saídas originais, conferir cobertura e submeter o mesmo manifesto aos dois juízes desta sessão.
8. Resolver achados materiais; liberar L2 somente após ambos aceitarem o predecessor obrigatório desse escopo.
9. Repetir para L2 componentes, L3 fluxos e L4 ownership/manutenção; manter camadas intermediárias utilizáveis.
10. Tratar descoberta inferior como delta vinculado e reavaliar os dependentes afetados, preservando irmãos válidos.
11. Construir casos de manutenção: mudança de entrada/API, violação de permissão, falha de modelo/storage,
    impacto sobre cliente/UI e pedido fora do escopo; congelar oracle antes de expor resultados.
12. Preparar/efetuar importação e consumo pelo caminho real disponível, registrando candidato e recibos exatos.
    Enquanto faltar adapter ou publicação autorizada, conservar os produtos nativos e nomear somente essa lacuna.

## Dois juízes e consumidores locais

Criar J1 de fidelidade/autoridade e J2 de completude/utilidade; ambos cobrem todos os critérios locais aplicáveis.
Usar contexto independente do produtor, IDs reais persistentes e follow-up para correções, conforme `judging.md`.
Nenhum juiz escreve o candidato; nenhum terceiro voto, maioria ou parecer do lead substitui os dois julgamentos.
Exigir `PASS`, `FIX-FIRST` ou `HOLD` com manifesto, critério e evidência; pedido de evidência não é aprovação.
Conservar o próprio roster S1: IDs de juízes de outras sessões ou do histórico Terra não são reutilizáveis aqui.
Executar consumidores separados do oracle, com acesso somente ao índice/leitor Atlas quando disponível e permitido.
Registrar consultas, versão, bytes/seções, recusas e respostas; abrir Markdown diretamente não prova Atlas-only.
Se não houver leitor utilizável ou isolamento suficiente, registrar o requisito faltante e concluir as partes independentes.

## Critérios e provas

Inventariar AC-01..10, CC-1..7, SC-1..5 e DOD-1..7 para este domínio, com aplicabilidade e evidência por linha.
Manter GO-A1..7, GO-I1..8 e QS-1..6; um critério compartilhado aberto não desaparece da matriz local.
AC-01/CC-1 exigem cobertura finita S1; AC-02/03 e SC-1/2 exigem utilidade e leituras reais, inclusive intermediários.
AC-04..06/CC-2..4/SC-3 requerem produtor, recusas, cache e rebuild observados para os casos aplicáveis.
AC-07/09/10 e CC-5/7 precisam vincular recuperação, callers, compatibilidade e preservação relevantes ao domínio.
AC-08/CC-6/SC-4 exigem ledger de produtores, juízes, consumidores e correções; tokens/custo não expostos são `UNKNOWN`.
DOD e SC-5 requerem provas executadas e decisões explícitas; relato estático não comprova efeitos em runtime.
Preparar casos/gates de CI exigidos com candidato exato; não executar testes locais sem autorização explícita.
Registrar CI `not_run`/bloqueado quando aplicável; isso não paralisa inventário, camadas ou julgamentos independentes.

## Saídas e encerramento

ROOT cria seu próprio par `integration/J1` e `integration/J2`; os dois juízes locais não assumem a integração final.

- `inventory.json`, `needs.json` e `acceptance-map.json`: população S1, necessidades, critérios e fronteiras.
- `layers/`, `recipes/`, `manifests/`: originais L1–L4, derivações, dependências, fontes e hashes reais.
- `judge-roster.json`, `judgments/`, `corrections/`: dois juízes, decisões por versão e fechamento dos defeitos.
- `consumer-cases/`, `evidence/`, `criteria.json`: tarefas, execução observada, aplicabilidade e pendências.
- `reuse-ledger.json`, `execution-ledger.jsonl`, `proposals/`: vínculos v1, uso, tentativas incertas e alterações necessárias.
- `handoff.json`: campos/refs conforme `handoffs.md`, sem SHA autorreferente nem branch móvel como identidade.

Entregar a ROOT pacote S1 julgável/aceito no alcance demonstrado; não atribuir a S1 aprovação repo-wide ou liberação de outros.
Publicar checkpoints e trabalho independente mesmo se uma prova de runtime/CI ficar aberta, com próximo passo preciso.
Informar commits, camadas efetivamente julgadas, consumidores executados, desconhecidos e critérios restantes.
