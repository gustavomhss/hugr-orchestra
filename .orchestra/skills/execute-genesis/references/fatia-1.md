# Fatia 1 — escopo completo, evidência e execução econômica

## Sumário

[Missão](#missão-e-identidade) · [Fontes](#fontes-obrigatórias-e-alcance) · [Execução](#execução) ·
[Handoff](#entradas-saídas-e-barreiras) · [Critérios](#critérios-locais) · [Estado](#estado-e-correção).
Aplicar também [campanha](campaign.md), [juízo](judging.md), [runtime](runtime.md) e [handoffs](handoffs.md).

## Missão e identidade

Executar G0 e G1 da campanha `20261111-v1` para o **Orchestra inteiro**.
Congelar a população que precisa de ownership e o contrato que permite às demais fatias trabalhar.
Preservar o contrato global AC-01..10; a aceitação antiga do piloto Session-input tem alcance próprio.
Esta fatia não é um braço do `atlas mine` nem um relatório que substitui produção.

- Repositório: `gustavomhss/hugr-orchestra`.
- Fonte inicial: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Branch exclusiva: `genesis-chatgpt-s1`.
- Evidência durável: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s1/`.
- Registrar `source_revision`, `candidate_revision` e `protocol_revision` conforme `handoffs.md`.

## Fontes obrigatórias e alcance

Ler no SHA inicial `AGENTS.md` e os seguintes arquivos sob `modules/atlas/docs/design/`:

- `genesis-ownership-plan.md`, especialmente GO-A, GO-I, AC, CC, SC, QS e DoD.
- `genesis-global-completion-plan.md`, pacotes G0/G1 e mapa das obrigações restantes.
- `genesis-campaign-reconciliation.md` e `genesis-economy-control-contract.md`.
- `genesis-recovery-worklist.md`, correção de produto e obrigações históricas; não interpretar cada estado antigo como atual.
- `genesis-ownership-results/README.md`, seguido somente dos manifestos necessários para verificar reaproveitamento.

Inspecionar os seams existentes antes de propor mudanças:
`modules/atlas/packages/adapter-io/src/llm.ts`,
`packages/llm/src/route/executor.ts`,
`modules/atlas/packages/adapter-io/src/ownership-input.ts` e
`modules/atlas/packages/knowledge/src/ownership/update-plan.ts`.
Ler é obrigatório; o nome de um arquivo não prova que um controle executou.

## Escrita e coordenação

Ser o único autor do inventário, do contrato econômico e do registro de execução desta fatia.
Guardar esses artefatos no prefixo `s1/`; manter propostas de implementação em `s1/proposals/`.
Não alterar stores, contratos compartilhados, exports, workflows ou políticas de produção.
Entregar mudanças nesses seams como patches para S5 integrar após revisar o contrato e os donos.
Não modificar registros históricos, corpos aceitos ou resultados de outras fatias.
Publicar cada handoff em commit próprio, sem force-push e sem avançar a branch de origem.

## Execução

1. Verificar capacidades reais: leitura Git, escrita na branch, runtime, subagentes e persistência.
   Registrar ausências como capacidades ausentes; não inferir ambiente completo do conector GitHub.
2. Enumerar a árvore versionada inteira no SHA fonte, com paginação e verificação de completude.
   Distinguir arquivos reais, symlinks, submódulos, gerados, dependências vendorizadas e artefatos históricos.
3. Construir um inventário finito de domínios, fluxos do produto, contratos públicos e superfícies operacionais.
   Relacionar código relevante, documentação de produto, configurações, testes, skills e fronteiras geradas.
   Toda exclusão deve ter motivo e cobertura alternativa; não excluir uma área por ser fria ou pouco alterada.
4. Atribuir um dono primário a cada necessidade e à sua evidência, permitindo referências compartilhadas.
   Detectar fontes sem destino, necessidades sem fonte, lacunas críticas e sobreposição de responsabilidade.
5. Mapear necessidades → artefatos requeridos → dependências → casos → critérios globais.
   Registrar os casos de consumo necessários a cada artefato intermediário, sem escrever suas respostas.
6. Comparar artefatos aceitos do piloto com as fontes, receitas, autoridade e resultados atuais.
   Reutilizar apenas a equivalência demonstrada; conservar julgamentos originais com seus bindings antigos.
7. Congelar um contrato de interfaces consumível por S2–S5: identidades, invalidadores, handoff e limite de autoridade.
   Não adicionar uma segunda base de conhecimento ou um orquestrador genérico.
8. Preparar um plano finito de trabalho nativo: tarefas, produtores, juízes, consumidores e correções previstas.
   Dimensionar a partir dos pacotes reais e das capacidades observadas; não importar limites de 10 ou 200 sites.
   A execução nativa já foi autorizada pelo proprietário; congelar o plano operacional não exige pedi-la novamente.
   Pré-alocar quotas lógicas disjuntas S1–S5; cada sessão escreve seu ledger e S5 agrega os recibos imutáveis.
9. Implementar ou propor, no seam existente, reserva antes da emissão, identificação de pedidos e liquidação.
   Verificar com entradas determinísticas a identidade, concorrência, duplicação, falha de journal e retomada.
   Usar o caminho real do adapter/execução; uma função fictícia que retorna contagens não estabelece conformance.
10. Registrar cada chamada nativa própria observável antes da emissão e seu resultado após retorno.
    Separar chamadas lógicas, tentativas físicas expostas, uso informado e reservas sem liquidação.
    Quando o host não expuser tokens, dinheiro ou tentativas internas, escrever `UNKNOWN` e a limitação.
11. Congelar as garantias efetivamente possíveis para este host e compará-las com AC-08.
    Não prometer teto monetário, inferência gratuita ou observação física que a sessão não oferece.
    Uma obrigação não demonstrada continua aberta; a inferência nativa autorizada não a transforma em PASS.
12. Entregar contrato e inventário a S5 para juízo; publicar versões preparatórias utilizáveis por S2–S4.
    Liberar produção dependente somente para o subconjunto cuja interface, autoridade e envelope estejam resolvidos.

## Entradas, saídas e barreiras

Esta fatia inicia pela fonte e pelo kit; não depende de um resultado futuro de outra fatia.
S5 pode revisar o contrato enquanto S1 conclui controles, sem aceitar uma versão por antecipação.

Produzir no mínimo:

- `inventory.json`: população finita, domínios/fluxos, fontes exatas, inclusões/exclusões e donos.
- `acceptance-map.json`: cada AC/CC/SC/DoD com responsável, evidência reutilizável e obrigação restante.
- `criteria.json`: resultados dos critérios desta fatia no formato comum, com referências à evidência.
- `execution-contract.md`: interfaces, autoridade, garantias observáveis e limitações do host.
- `execution-ledger.jsonl`: pedidos/reservas próprios e referências às alocações, sem credenciais ou dupla contagem.
- `evidence/`: recibos dos controles efetivamente executados e suas entradas; indicar explicitamente os não executados.
- `handoff.json`: esquema `genesis-session-handoff/v1`, campanha `20261111-v1` e referências `{commit,path,sha256}`.

Seguir `handoffs.md` para preparar o handoff sem autorreferência ao commit que ainda o contém.
S5 é o único autor do `campaign-manifest`; os registros S1 alimentam esse manifesto comum.

Não usar arquivos de outra conversa ou IDs nativos alheios como dependência implícita.
Consumidores obtêm o handoff pela branch e passam a usar o commit exato; branch móvel não é identidade de evidência.
Se o inventário mudar, publicar delta com necessidades afetadas e pedir reavaliação dos bindings envolvidos.

## Critérios locais

**Axiomas:** GO-A1/2/4/5/6/7; cobrir o produto inteiro com reuso e execução observável.
**Invariantes:** GO-I1/2/5/6/7/8; preservar originais e não confundir metadados com suficiência semântica.
**AC próprios:** AC-01 e contrato/controle/reconciliação de AC-08; S5 decide a aceitação global integrada.
**CC:** CC-1 requer população finita completa; CC-6 requer economia reconciliada ao alcance realmente observado.
**SC:** SC-4 distingue construção, validação, atualização e consumo; nenhuma economia percentual sem base medida.
**QS:** QS-1/3/4/5/6; evidência atribuída, mecanismos mínimos e controles com poder real de recusa.

**DoD local:** o inventário não omite domínios relevantes, os critérios têm dono e as interfaces têm bindings.
Os controles econômicos têm resultados reais ou blockers precisos; nenhum uso desconhecido virou zero.
Os dois juízes de S5 recebem a mesma versão completa do contrato e das evidências necessárias.
Uma aprovação scoped não fecha AC-08 global nem presume execução de S2–S4.

## Estado e correção

Usar `READY_FOR_JUDGMENT` para o pacote completo entregue ao julgamento, nunca para declarar aceite.
Usar `BLOCKED` quando faltar capacidade, evidência crítica ou uma garantia necessária; nomear o requisito exato.
Persistir o trabalho já completo e identificar quais dependentes podem continuar sem ultrapassar a barreira.
Corrigir achados concretos dos juízes, mantendo versões anteriores e reavaliando apenas critérios afetados.
Não reiniciar trabalhos aceitos, criar chamadas para reconstruir cobrança antiga ou buscar um terceiro voto.
Se uma correção não puder fechar o defeito com as capacidades reais, registrar o blocker e a próxima ação concreta.
Terminar com commit/URL do handoff, cobertura, execuções observadas, desconhecidos e barreiras restantes.
