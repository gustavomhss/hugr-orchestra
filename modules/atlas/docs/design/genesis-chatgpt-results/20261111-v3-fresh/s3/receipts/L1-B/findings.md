# Achados e limites — candidato L1-B Relay

**Estado:** `L1_CANDIDATE_FOR_REVIEW`. Produtor nativo: `/root/producer_relay_l1`, execução `bdac971f-e4ee-40e5-ad9b-30d659303bab`. Este produtor escreveu o corpo e os artefatos locais; não exerceu o papel de juiz, não declarou aceite e não fez escrita remota. O baseline de produto permaneceu `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

## Achados incorporados à base factual

| ID | Achado e consequência para usar L1 | Fonte pinada capturada |
|---|---|---|
| R-01 | Não há um contrato único para todos os drivers. Arm shell, CLI eval/check e benchmark divergem em DoD, regressão, posição e efeito sobre estado. Arm TS ainda acrescenta host_check e settlement nativo. O corpo conserva a matriz, em vez de inferir paridade geral. | `modules/relay/SPEC.md:39–55`; `src/gate/control.ts`, `src/arm/round.ts`, `bin/relay-gate`, relativos ao módulo. |
| R-02 | Core atual aplica 15 minutos ao check de workflow, 60 s a Verify/Test now, e filtra ambiente sem herdar RELAY_* do processo. Comentários de GateShell e a exceção WP3-3 de paridade mencionam contrato antigo. Código do host instalado prevalece nesta descrição. | `packages/core/src/relay.ts:42–46,219–257`; `modules/relay/src/gate/shell.ts:14–28`; `modules/relay/test/golden/PARITY-EXCEPTIONS.md`. |
| R-03 | Integrity exit 0 aceita ledger vazio/prefixo, audit exit 0 exige outros sinais, e ausência de sprint pode deixar oracle_recheck not-run. Nenhum deles, isolado, prova frescor dos artefatos, independência ou autoria. Recuperar lock, liberar arm e reconciliar disposição são operações distintas. | `modules/relay/src/ledger/verify.ts:11–13,43–54`; `src/audit.ts:119–175,659–672`; `src/arm/settlement.ts:13–69`; `packages/core/src/relay.ts:374–418,491–519`. |
| R-04 | Policy preprocessing repete IDs entre WPs; lint e comparação com sprint rejeitam essa situação. O conflito já está declarado na documentação e foi preservado como limitação, não como cobertura validada. | `modules/relay/docs/guardrails.md:29–35`. |
| R-05 | Authoring Python remanescente é referência de regressão; o host instalado usa TS/Server/Core. LangGraph Python continua sendo integração atual, mas judge é advisory sem execução de modelo, approvals são autorrelatados e o ledger não usa HMAC. | `modules/relay/docs/python-runtime-disposition.md`; `lib/orchestra_relay/__init__.py:175–183` e `README.md:37–57`; `packages/server/src/handlers/relay-document.ts`. |
| R-06 | A guia de UI descreve fase como sprint; Graph compile efetivo compila cadeia em WPs e fases em macros. A visão EXPERIENCE/PLAN de LangGraph também contém intenções e cortes, não todas as portas instaladas. O corpo descreve o código, atribuindo os documentos ao seu papel. | `docs/guides/relay.md:21`; `modules/relay/src/authoring/graph.ts:111–231`; `specs/relay-langgraph/PLAN.md` e `EXPERIENCE.md`. |
| R-07 | Cinco profiles são admitidos; quatro estão embarcados/editáveis mas bloqueados por ferramentas ainda não portadas. Publicar documento não arma nem agenda execução; check público de documento retorna maestro-execution-required. | `modules/relay/src/authoring/store.ts:253–339`; `packages/server/src/handlers/relay-document.ts:158–165`. |

Todos os caminhos da tabela estão vinculados por commit, blob Git, SHA-256 externo e captura exata em `sources.json`. Os trechos mais decisivos estão em `review-evidence.md`; a tabela não afirma que cada fonte foi lida integralmente.

## Reconciliação e profundidade efetivas

- População exata de 3.700 blobs reconciliada sem omissão, extra ou duplicata. Cada entrada em `coverage.json` tem classificação, disposição, família, need e justificativa referenciada de profundidade.
- São 24 famílias/needs compartilhados. Os 3.330 membros golden e 66 test/fixtures são evidência agrupada, não milhares de necessidades nem afirmações independentes de correção. Os 304 caminhos restantes incluem código, documentos, testes, configuração e outras fixtures.
- Foram capturadas 109 fontes pelo conector GitHub: 104 do baseline e 5 do protocolo. Há 84 fontes com conteúdo selecionado inspecionado e 25 somente capturadas/verificadas por integridade. Na população, 76 caminhos tiveram conteúdo selecionado inspecionado, 23 tiveram captura sem leitura individual e 3.601 receberam inventário de path/blob com contrato de família.
- As capturas completas preservam os bytes. O log de leitura registra intervalos solicitados; respostas de ferramenta podem ter sido truncadas. Não se declara leitura integral de todos os intervalos, arquivos ou fixtures. A profundidade semântica de L1 está nas entradas e contratos representativos.
- Os 14 SHA-256 registrados no ORACLE **do repositório** correspondem aos 14 arquivos capturados. Esse recibo é uma conferência de metadados, sem rodar generators ou produto. O oracle reservado da campanha não foi aberto; só se conservou o hash informado no despacho.

## O que continua desconhecido ou fora deste aceite

Não há resultado de execução atual do produto, teste local, build, lint de produto, CI/Actions, chamadas de judge/modelo, benchmark ou demonstração funcional desta produção. `AGENTS.md` exige Actions; nenhum run foi solicitado, disparado ou inventado. Resultados históricos preservados não foram promovidos a evidência desta execução.

Não se verificou equivalência semântica individual de todos os goldens, regeneração de todos os profiles, ambiente instalado de cada integração, robustez sob falha real ou roteiro operacional completo de migração/recuperação. Esses aprofundamentos não foram usados para preencher lacunas com suposições. A continuidade operacional cabe a L2 após aceite local completo de L1, segundo o último despacho; nenhuma produção L2–L4 foi iniciada.

Não restou fonte essencial de L1 bloqueada por acesso. Houve uma tentativa de caminho presumido `packages/core/src/relay-recovery.ts` no baseline que retornou 404; a recuperação real foi localizada e lida em `packages/core/src/relay.ts`. O caminho inexistente não virou fonte nem foi incluído na população. Não houve fallback para gh, login, token ou transporte remoto de escrita.

## Separação entre verificação e juízo

`verification.json` verifica somente bytes, hashes, limites de payload, índices de trechos e reconciliação do inventário. Não concede QS/CC/GO, revisão fria ou aceite de conteúdo. O produtor entrega o candidato concreto; a orquestradora e os juízes independentes decidem o aceite e quaisquer correções. Todas as escritas deste agente ficaram em `agents/relay-l1/`, sem alterar fontes ou fixtures.
