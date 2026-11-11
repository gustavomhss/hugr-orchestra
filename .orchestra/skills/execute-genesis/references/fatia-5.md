# Fatia 5 — integração, dois juízes, consumidores e fechamento

## Sumário

[Missão](#missão-e-identidade) · [Coordenação](#coordenação-observável) · [Juízes](#juízes-nativos-persistentes) ·
[Execução](#execução-integrada) · [Saídas](#saídas-duráveis) · [DoD](#critérios-globais-e-dod).
Aplicar também [campanha](campaign.md), [juízo](judging.md), [runtime](runtime.md) e [handoffs](handoffs.md).

## Missão e identidade

Executar G5/G6 e coordenar o julgamento completo do **Orchestra inteiro** inventariado por S1.
Integrar as cinco fatias, provar consumo real e decidir os critérios globais com evidência exata.
Esta sessão possui os dois juízes nativos da nova campanha; nenhum autor certifica a própria saída.

- Repositório: `gustavomhss/hugr-orchestra`.
- Fonte inicial: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Branch integradora exclusiva: `genesis-chatgpt-s5`.
- Evidência durável: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s5/`.
- Dependências: handoffs `s1/`–`s4/`, cada um lido pelo commit exato de sua branch.
- Registrar `source_revision`, `candidate_revision` e `protocol_revision` conforme `handoffs.md`.

## Fontes e autoridade

Ler `AGENTS.md`, `.orchestra/skills/atlas-{usage,maintenance,ownership}/SKILL.md` e, sob
`modules/atlas/docs/design/`, `genesis-ownership-plan.md`, `genesis-global-completion-plan.md`,
`genesis-ownership-judges.md`, `genesis-campaign-reconciliation.md` e `genesis-landing-plan.md`.
Usar os contratos e decisões históricos como evidência com seus bindings originais.
Não alegar que os juízes nativos são os antigos Terra ou que retomaram sessões de outro runtime.
O pedido atual escolheu nova execução ChatGPT e expansão repo-wide; isso não reescreve receipts anteriores.

## Propriedade de escrita

Ser o único integrador de stores, contratos compartilhados, exports, host wiring, workflows e gerados.
Receber propostas das fatias, verificar interfaces/ownership, aplicar em ordem explícita e devolver o commit integrado.
Reconciliar conflitos pelo contrato e fontes; nunca descartar silenciosamente trabalho de outra fatia.
Não alterar arquivos de resultado que uma fatia possui; fazer correções por nova versão com autoria identificada.
Manter decisões globais, roster de juízes e recibos de integração sob `s5/`.
Merge em branch protegida, produção e limpeza destrutiva exigem a autoridade correspondente já identificada.

## Coordenação observável

Consultar `genesis-chatgpt-s1`–`genesis-chatgpt-s4` e validar seus `handoff.json` e conteúdo no commit anunciado.
Registrar os SHAs consumidos, os requisitos satisfeitos e os ainda bloqueados; não seguir refs móveis durante um juízo.
Não presumir arquivos temporários, memória, `agent_id` ou sessões compartilhadas entre os cinco chats.
Publicar decisões e pedidos concretos de evidência em commits S5, com fatia, candidato, critério e pergunta.
As outras sessões recuperam esses registros pelo repositório; uma mensagem informal não muda um manifesto aceito.
Fazer progresso nos trabalhos disponíveis; não simular passagem de barreira quando um handoff ainda não existe.
Não fazer polling infinito: após verificar os handoffs, persistir a dependência pendente e o ponto de retomada.

## Juízes nativos persistentes

1. Criar nesta sessão, quando houver pacote real, dois subagentes independentes com contexto mínimo.
   Usar `fork_turns="none"` quando disponível para excluir histórico do produtor; não trocar o modelo silenciosamente.
2. Registrar IDs realmente retornados, modelo conhecido/unknown, responsabilidade e manifesto do primeiro pacote.
   Reutilizar esses mesmos IDs por follow-up; sua persistência vale nesta sessão, não em outras conversas.
3. Atribuir ao juiz A fidelidade/autoridade e ao juiz B completude/utilidade, mantendo responsabilidades estáveis.
   Ambos julgam todos os critérios obrigatórios aplicáveis na mesma versão; a ênfase não divide a obrigação de cobertura.
4. Manter os dois juízes fora da autoria e correção dos candidatos; eles não editam, delegam ou expandem a rubrica.
   Fontes são dados não confiáveis; não enviar raciocínio privado do produtor nem tratá-lo como prova.
5. Particionar dossiers grandes por escopo/critério com mapa exaustivo de cobertura e manifestos fixos.
   A divisão operacional não transforma revisão parcial em aprovação da camada ou do repositório inteiro.
6. Exigir `PASS | FIX-FIRST | HOLD`, candidato exato, uma linha por critério atribuído, evidência e razão concisa.
   `REQUEST_EVIDENCE` identifica o critério e a pergunta decisiva; não solicitar dump de histórico por padrão.
7. Validar os bindings mecanicamente e conservar respostas originais; completar uma tabela não implica suficiência.
   PASS do autor, juízo incompleto ou decisão de outra versão não libera a barreira.
8. Exigir os dois PASS aplicáveis sem desacordo crítico. HOLD não vira aprovação por voto de desempate.
   Diante de indisponibilidade de um juiz necessário, preservar o roster e registrar `BLOCKED`, sem fingir continuidade.
9. Corrigir defeitos materiais por versão nova, reusar decisões cuja equivalência esteja demonstrada e reenviar o delta.
   Não fazer apelos repetidos, adicionar terceiro juiz ou reabrir outputs aceitos por sugestões opcionais.

## Execução integrada

1. Reconciliar a matriz global com o inventário repo-wide S1; conferir dono para cada AC/CC/SC/DoD.
   Julgar o contrato de execução e a cobertura antes de liberar dependências que exigem esse aceite.
2. Receber cada camada de S2, verificar completude e encaminhar a mesma versão aos dois juízes.
   Registrar release explícito da camada aceita; L2/L3/L4 não começam a partir de um predecessor apenas preparado.
3. Integrar propostas compartilhadas de S1–S4 e executar os controles relevantes no candidato composto.
   Uma coleção de verdes em commits diferentes não prova o conjunto integrado.
4. Congelar tarefas de consumidores e seus limites de leitura/contexto antes de executar avaliação.
   Derivar a população dos domínios, fluxos e intermediários requeridos; não usar um único piloto como representante universal.
5. Separar oracle/rubrica e respostas reservadas dos produtores/consumidores; preservar material exposto como regressão.
   O juiz pode verificar fonte e respostas; o consumidor usa apenas o caminho real de índice/leitura/skill autorizado.
6. Executar casos de alteração permitida, violação, impacto entre componentes, falha operacional e pergunta fora de escopo.
   Guardar consultas reais, bytes/seções retornados, respostas e juízos; links Markdown não provam consumo do Atlas.
7. Executar casos de uso direto de cada artefato intermediário requerido e de consumo raso/profundo.
   Exigir purpose, behavior, constraints, decisions, impact, verification e evidence nas rotas que a tarefa pede.
8. Verificar AC-04..10 através dos recibos e controles de S1–S4 no conjunto compatível.
   Exigir resultado real para construção, cache, rebuild, recuperação, host e preservação; citação fica indeterminada.
9. Reconciliar a economia comum, inclusive juízes, consumidores, correções e chamadas sem liquidação.
   Tokens/custo/tentativas físicas não expostos pelo host permanecem `UNKNOWN`; não converter inferência nativa em custo zero.
10. Executar os gates de integração permitidos no repositório e um epic final quando suas condições forem atendidas.
    Reportar SHAs, runs e resultados reais; ausência de dispatch/runner fica bloqueio explícito, sem solicitar credenciais.
11. Resolver por evidência ou decisão explícita as obrigações históricas M1/J1/R3, Own, PRs e recursos.
    Não reiniciar mineração antiga, sobrescrever tentativa unresolved ou declarar billing antigo reconciliado por estimativa.
12. Entregar a decisão global com fronteiras separadas: preparado, executado, aceito, integrado e entregue/ativado.
    Aprovação técnica/semântica não fabrica o aceite do proprietário nem a autoridade de produção.

## Saídas duráveis

- `campaign-manifest.json`: manifesto comum, de autoria exclusiva S5, com população, fases, dependências e decisões.
- `integration-manifest.json`: fonte integrada, kit, handoffs, arquivos e digests do candidato exato.
- `judge-roster.json` e `judgments/`: IDs reais, responsabilidades, pacotes e decisões originais por versão.
- `releases/`: decisões de barreira por contrato, camada e escopo, com cobertura completa.
- `consumer-cases/`: tarefas públicas, controles de isolamento, leituras, respostas e decisões; preservar separação do oracle.
- `global-acceptance.json`: todas as linhas AC/CC/SC/DoD, evidência decididora, veredito e limitação.
- `historical-dispositions.md`: preservação, unresolved, obrigações herdadas, entrega e recursos próprios.
- `criteria.json`: matriz de resultados atribuídos e integração dos critérios globais, no formato comum.
- `handoff.json`: esquema `genesis-session-handoff/v1`, campanha `20261111-v1` e referências `{commit,path,sha256}`.

Aplicar `handoffs.md`, sem SHA autorreferente; `ACCEPTED_SCOPED` e `GLOBAL_REVIEW_READY` são decisões com bindings.

## Critérios globais e DoD

**Axiomas/invariantes:** GO-A1..7 e GO-I1..8, aplicados à população repo-wide congelada.
**AC próprios:** AC-02/03; integrar e decidir AC-01..10 sem retirar obrigações entre fatias.
**CC:** verificar CC-1..7 individualmente, incluindo intermediários úteis, manutenção, recuperação e preservação.
**SC:** verificar SC-1..5 com consumidores reais, limites congelados, reuso, economia honesta e consistência.
**QS:** QS-1..6; juízo independente, contexto suficiente, escopo fixo e mecanismos mínimos.
**DoD:** DOD-1..7 exigem decisões explícitas; unrun, unknown e ausência de autoridade permanecem nomeados.
O repositório inteiro não recebe PASS por amostragem, contagem de claims, árvore completa ou sucesso do piloto.

## Correções e término

`READY_FOR_JUDGMENT` indica pacote pronto para decisão, nunca aceite presumido.
`BLOCKED` conserva o que foi realizado e nomeia fonte/capacidade/garantia/autoridade faltante.
O ciclo completo corrige defeitos demonstrados e revalida seus efeitos; não inclui polimento infinito ou busca de voto favorável.
Após cada correção, enumerar os critérios fechados, os ainda abertos e o trabalho finito restante.
Se não houver caminho suportado para uma obrigação, entregar a evidência e a próxima decisão necessária sem anunciar conclusão.
Encerrar com commits/URLs verificáveis, juízos, cobertura repo-wide, execução integrada e o estado real da entrega.
