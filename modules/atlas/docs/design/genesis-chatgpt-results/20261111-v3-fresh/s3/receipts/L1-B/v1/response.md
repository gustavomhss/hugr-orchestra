# Resposta de produção — L1-B Relay

**Candidato factual L1-B concluído e pronto para revisão local independente.** Estado: `L1_CANDIDATE_FOR_REVIEW`; não há declaração de aceite, publicação ou avanço para L2. Produtor nativo real: `/root/producer_relay_l1`, convocado na execução `bdac971f-e4ee-40e5-ad9b-30d659303bab` para escrever esta unidade. Corpo e artefatos foram produzidos por este agente; não houve atuação como juiz, escrita remota ou leitura de entregas alheias.

Repositório `gustavomhss/hugr-orchestra`; baseline imutável `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Todas as fontes foram adquiridas pelo conector GitHub. Não houve gh, login ou GH_TOKEN. O pedido original e os complementos estão em `request.md`. As únicas escritas deste produtor estão em `/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/relay-l1/`.

## Entrega concreta

`body.md` contém a base L1 em 23.802 bytes: propósito, superfície pública, mapa de famílias, entradas e saídas, autoridade dos controles, matriz dos drivers, persistência/auditoria/recovery, authoring/hooks e integração LangGraph. Distingue runtime TS, ferramentas shell/Python atuais, referência Python histórica e visão de produto. Os limites de autoridade aparecem junto das garantias; não são inferidos da existência de testes ou de hashes.

`review-evidence.md` tem 15.697 bytes, com 35 trechos literais de 11 arquivos, cada um acompanhado de path, blob e intervalo de linhas. `review-evidence-index.json` adiciona SHA-256 de cada trecho. O corpo e esses trechos compõem o payload factual para os juízes; capturas completas e inventário ficam disponíveis localmente.

`coverage.json` reconcilia exatamente os 3.700 blobs da população L1-B: zero omissões, extras ou duplicatas. Cada path tem classificação, disposição, família, need e profundidade justificada. São 24 necessidades por família, compartilhadas por seus membros. A população contém 3.330 golden, 66 test/fixtures e 304 demais caminhos; o corpus não foi convertido em milhares de necessidades semânticas.

`sources.json` contém 109 fontes: 104 do baseline e 5 do protocolo. Cada uma conserva path, commit, blob Git, SHA-256 externo computado sobre os bytes decodificados, captura exata local e referência à resposta do conector. Foram inspecionados conteúdos selecionados de 84 fontes; as outras 25 são explicitamente capturas de integridade, sem alegação de leitura individual. Na população, essa profundidade corresponde a 76 caminhos lidos seletivamente, 23 só capturados e 3.601 inventariados por path/blob e contrato de família. Não se declara leitura integral das 3.700 entradas.

## Achados materiais já incorporados

- Arm shell, CLI eval/check, benchmark e Arm TS têm contratos distintos de ordem, regressão, posição e efeitos. `cmd`, judge e host_check não têm a mesma autoridade; judge advisory e revisão rotulada não comprovam independência.
- Core atual configura 15 minutos por check de workflow e 60 s para Verify/Test now, com ambiente filtrado. Comentários antigos de GateShell/paridade sobre RELAY_* e 60 s não são usados como autoridade sobre o host instalado.
- Ledger íntegro pode ser prefixo válido; audit exit 0 sem oracle_recheck ok não prova correspondência com o plano. Cadeia, terminalidade, integridade, autoria, qualidade e frescor são propriedades diferentes.
- Recovery de lock, release de arm e repair de settlement têm pré-condições distintas. Registros precedem determinadas escritas, mas não há promessa de transação ou exactly-once para efeitos arbitrários.
- Policy preprocessing repete IDs e conflita com lint/audit; quatro dos nove profiles embarcados não são admitidos para execução. A rota de documento recusa checks executáveis, pertencentes ao Maestro.
- LangGraph Python atual oferece gated, shell checks e approvals autorrelatados; judge não executa modelo, ledger não tem HMAC e retomada após processo depende de checkpointer durável. PLAN/EXPERIENCE não instalam capacidades por declaração.

As referências de cada achado estão no corpo, em `findings.md` e no manifesto pinado. Findings também registra a divergência entre a guia sobre fases e Graph compile, os limites de inspeção e o único caminho presumido que retornou 404 (`packages/core/src/relay-recovery.ts`), resolvido ao localizar recovery em `packages/core/src/relay.ts`.

## Verificação realmente realizada

O recibo `verification.json` terminou em **PASS_ARTIFACT_INTEGRITY_ONLY**. Conferiu população exata, enum de needs, famílias e justificativas, capturas e hashes Git/SHA-256, correspondência de todos os trechos, limites de tamanho e ausência de arquivo SKILL.md novo. A conferência estática do ORACLE **do repositório** resultou em 14/14 SHA-256 correspondentes; não executou os generators.

**Não foram executados testes do produto, build, lint do produto, CI/Actions, benchmark, demonstração ou chamadas de judge/modelo.** Fixtures, goldens e fonte pinada não foram modificados. `AGENTS.md` exige Actions; nenhum resultado foi inventado. A validação de artefatos não é teste de produto nem revisão fria e não concede QS/CC/GO ou aceite.

O oracle reservado da campanha não foi aberto. Foi preservado apenas o hash informado no despacho: `fdfe2e9e61ba11f6d90885e92c397dc7d7e424032b46bc00f240691bc0098fce`.

## Gaps e próximo limite

Não há fonte essencial de L1 pendente por acesso. Permanecem sem prova atual a execução do produto, a equivalência individual de todos os goldens, a regeneração de todos os profiles, o ambiente efetivamente instalado e robustez operacional sob falha. Esses limites estão explícitos; aprofundamento operacional é L2, condicionado ao aceite local completo de L1. Este produtor não iniciou L2–L4 e não tomou o aceite em nome dos juízes.

## Arquivos e SHA-256

Todos os caminhos abaixo são relativos ao diretório exclusivo do produtor acima. Os hashes descrevem os bytes finais destes arquivos; `response.md` não contém o próprio hash para evitar autorreferência. O hash da resposta é fornecido na mensagem final à orquestradora.

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| `body.md` | 23802 | `660d39c4a3f140f86af31d84369e44835abab6e9b26136439d07eb702f63a528` |
| `review-evidence.md` | 15697 | `3a34a3e008b4d7ae42b17aff556a635d88a06e0b28b755e8f4a037795339e8cb` |
| `sources.json` | 161105 | `28a7a3ff3ec4dd337098c28d3fa3e8715d296142974302559180281fbf40e513` |
| `coverage.json` | 2575078 | `44615f804cd806ade4ac0770237156992badf63459d787a8c08dfb6f55fdfbb9` |
| `findings.md` | 6788 | `7c6af68f2ea2cbf1b98048fb34792f2bf8216d23e0e513c9c8bd728a17920550` |
| `request.md` | 3125 | `7d57f73c2c12d7c639430467cb2be4a4c321cb21b659ee570774bb8a998aec6c` |
| `review-evidence-index.json` | 13700 | `9a15d098d6e045625933e41bbb0563589777ee781cd555d7e37c7eda20a3a3da` |
| `oracle-pins-static-check.json` | 3762 | `a8448964866b7627d88de857b296dd0cb435e0085105bed28d4e541ea6f0132f` |
| `verification.json` | 5463 | `220caaf004559794fda05dc88b8349405d4e6ab975236042a858a651f564c30b` |

As respostas base64 do conector, capturas completas, `read-log.json` e scripts determinísticos de reconstrução/validação permanecem no mesmo diretório. `verification.json` contém os hashes dos scripts e dos artefatos de suporte; nenhuma dependência do produto foi importada ou executada pelos verificadores.
