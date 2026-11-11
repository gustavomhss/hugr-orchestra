# Fatia 2 — desktop, web, application shell e sistemas de interface

## Sumário

[Identidade](#identidade-e-início-independente) · [Domínio](#domínio-e-fronteiras) · [Execução](#execução-completa) · [Juízo](#dois-juízes-e-consumidores-locais) · [Critérios](#critérios-e-provas) · [Entrega](#saídas-e-encerramento).
Aplicar [campanha](campaign.md), [juízo](judging.md), [runtime](runtime.md), [handoffs](handoffs.md) e [partição](parallel-partition.json).

## Identidade e início independente

- Repositório: `gustavomhss/hugr-orchestra`; fatia `S2`.
- `campaign`: `20261111-v1`; `protocol_epoch`: `parallel-v2`.
- `results_epoch`: `20261111-v2-parallel`; branch preservada: `genesis-chatgpt-s2`.
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; registrar o commit real do kit.
- Saídas: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/s2/`.
- Registrar fonte, HEAD efetivo, candidato, protocolo e hashes distintos conforme `handoffs.md`.
- `integration_owner`: `root` (conversa original); branch integradora reservada: `genesis-chatgpt-final`.
- Integração reservada a ROOT: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/integration/`.

Começar o ciclo completo deste domínio a partir do baseline e da partição já congelada.
Não esperar inventário S1, implementação S4, julgamento ROOT nem output de outra conversa para produzir e julgar.
O papel antigo de S2 como produtor repo-wide foi substituído; preservar seus resultados sem manter essa dependência.

## Domínio e fronteiras

Resolver ownership por `parallel-partition.json`, não por uma lista aproximada ou nomes de funcionalidades.
Conferir **4.506 entradas**, com hash de caminhos `8b70f96dcbb623bdd1cc2a48b61d51d255d9d9ce90836efc9a5cd05f1fc5a582`.
O domínio inclui `apps/desktop`, `apps/web`, `apps/storybook`, `packages/app-shell`, `ui`, `session-ui` e `tui`.
Incluir `assets/`, imagens, glossários, temas, schemas UI e docs/skills/briefs exatos atribuídos pelo manifesto.
Specs `projects-board` e `orchestra-visual` pertencem a S2; `specs/atlas-ui/` pertence a S4 e pode ser consultado.
Classificar todos os assets, fixtures, i18n, testes de browser e e2e; remeter gerados ao gerador/contrato quando adequado.
Não confundir quantidade de arquivos de imagem/localização com quantidade de necessidades semânticas.
Ler baseline de core, protocolo, Maestro, Atlas e Omni para verificar fronteiras sem esperar artefatos alheios.

Ler `AGENTS.md`, as skills Atlas aplicáveis e os contratos normativos listados em `campaign.md`.
Inventariar bootstrap desktop, navegação, sessão, composer, terminal, configurações, erros e sincronização de estado.
Relacionar componentes, contexto, acessibilidade, RTL/i18n, temas, recuperação e comunicação desktop/servidor.
Distinguir intenção de design, comportamento de código e prova de interação efetivamente executada.

## Escrita e retomada

Inspecionar primeiro a branch S2 e os outputs v1; manter objetos, receipts e decisões históricas imutáveis.
Reutilizar somente equivalência demonstrada por hashes, fonte, receita, autoridade e critérios; não reiniciar tentativas incertas.
Os patches v1 de producer/rebuild/importer que agora pertencem a Atlas devem ser referenciados para S4 por objeto exato.
Não reaplicar esses patches em S2 nem alterar autoria/história para fazê-los parecer produzidos neste novo domínio.
Escrever resultados novos no namespace `s2/`; manter propostas externas identificadas por arquivo e owner do manifesto.
Mudanças mínimas de código necessárias ao Genesis podem ocorrer em candidato isolado dos componentes S2.
Não esperar permissão global ROOT para correção própria; contratos comuns seguem proposta e coordenação com o owner.
Não publicar aplicação, alterar produção ou iniciar uma reformulação de UI sob o pretexto de produzir ownership.

## Execução completa

1. Conferir capacidades reais, source pin e completude da materialização; blobs faltantes não contam como cobertura.
2. Enumerar e classificar a população S2, separando fluxo de produto, componente, asset e superfície gerada.
3. Congelar necessidades de manutenção e casos: estados, eventos, contrato de props, efeitos, erros e fronteiras.
4. Vincular necessidade → artefato → fonte → caso → critério, incluindo consumo direto dos intermediários exigidos.
5. Dividir produção entre subagentes disponíveis por componentes/fluxos, com contexto e escritas disjuntos.
6. Produzir L1 atribuído a código/docs/config; preservar saídas originais e lacunas sobre comportamento não observado.
7. Submeter a camada completa do escopo aos dois juízes locais; corrigir achados antes de liberar seu sucessor.
8. Produzir L2 de componentes, L3 de fluxos e L4 de ownership/manutenção, sempre a partir de predecessores aceitos.
9. Integrar relações entre shell, UI reutilizável, session-ui, TUI e superfícies desktop/web sem duplicar contratos.
10. Preparar casos de mudança em composer/navegação, quebra de contrato de componente, recuperação de erro,
    impacto sobre protocolo/core e pergunta fora do domínio; manter respostas esperadas separadas do produtor.
11. Consumir pelo índice/leitor real quando disponível; evidenciar limite de contexto, aprofundamento e abstinência.
12. Preservar conhecimento nativo julgável se importação/publicação/CI estiver indisponível e registrar o bloqueio exato.

## Dois juízes e consumidores locais

Manter J1 de fidelidade/autoridade e J2 de completude/utilidade nesta sessão, com IDs reais persistidos.
Ambos julgam todos os critérios aplicáveis do mesmo candidato; a ênfase não reduz cobertura nem permite autoaceite.
Dar contexto independente e dossiers por escopo conforme `judging.md`; juiz não edita candidato ou oracle.
Usar os mesmos agentes nas correções; conservar decisões anteriores e invalidar somente bindings afetados.
Dois PASS são exigidos para liberar a camada local; HOLD/REQUEST_EVIDENCE não viram PASS por avanço de outra sessão.
Separar consumidores dos produtores e do oracle; limitar o acesso ao caminho Atlas e registrar o isolamento possível.
Incluir leitura raso/profunda e casos diretos de intermediários, não somente uma resposta baseada no documento L4.
Screenshots, stories e testes existentes são fontes; só recibos de execução real comprovam a interação executada.

## Critérios e provas

Inventariar AC-01..10, CC-1..7, SC-1..5 e DOD-1..7 com aplicabilidade S2, evidência, estado e dependência concreta.
Aplicar GO-A1..7, GO-I1..8 e QS-1..6; manter obrigações compartilhadas abertas quando a prova não existir.
AC-01/CC-1 requerem necessidades finitas e cobertura dos fluxos UI, incluindo erro, recuperação e configuração.
AC-02/03, CC-2/3 e SC-1/2 requerem artefatos úteis e consumidores reais, com índices, limites e intermediários.
AC-04..06/CC-4/SC-3 requerem recusas, reuso e rebuild observados onde aplicáveis, sem inferi-los de JSON preparado.
AC-07/09/10, CC-5/7 e SC-5 exigem fronteiras de atualização, host e compatibilidade quando afetadas por S2.
AC-08/CC-6/SC-4 incluem todos os produtores, juízes e correções; uso/custo não expostos permanecem `UNKNOWN`.
Não executar testes locais, browser/e2e ou smoke tests sem autorização explícita; preparar gates de CI aplicáveis.
Um gate não executado mantém seu critério aberto; não bloqueia produção/julgamento independente nem vira verde presumido.

## Saídas e encerramento

ROOT cria seu próprio par `integration/J1` e `integration/J2`; os dois juízes locais não assumem a integração final.

- `inventory.json`, `needs.json`, `acceptance-map.json`: componentes, fluxos, assets representados e critérios locais.
- `layers/`, `recipes/`, `manifests/`: conhecimento cumulativo, dependências e vínculos exatos de fontes e outputs.
- `judge-roster.json`, `judgments/`, `corrections/`: dois votos por camada/revisão e resolução de achados.
- `consumer-cases/`, `evidence/`, `criteria.json`: tarefas independentes, consultas observadas e gates pendentes.
- `reuse-ledger.json`, `execution-ledger.jsonl`, `proposals/`: reuso v1, repasse exato para S4 e tentativas/uso preservados.
- `handoff.json`: identidade/bindings conforme `handoffs.md`; informar o estado real de cada artefato e prova.

Entregar a ROOT S2 completo no alcance demonstrado, sem alegar aceitação de backend, Atlas ou Orchestra inteiro.
Persistir checkpoints e prosseguir no trabalho independente quando faltar uma capacidade de execução específica.
Encerrar com commits, cobertura, camadas julgadas, consumidores, patches necessários e obrigações remanescentes.
