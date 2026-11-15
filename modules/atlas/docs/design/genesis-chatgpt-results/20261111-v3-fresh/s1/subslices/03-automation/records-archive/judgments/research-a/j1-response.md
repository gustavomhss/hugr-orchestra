## J1 — research-a: REQUEST_EVIDENCE

Recebidas as **7/7 partes**, encerradas por **FIM_DO_LOTE**. O parecer cobre o recorte declarado de `producers/research/body.md`, bytes UTF-8 **[0,35158)**, seções **R0–R7**, e a evidência literal transportada neste lote. Não usei ferramentas nem acessei arquivos.

**O corpo apresenta distinções de autoridade úteis e vários limites sustentados pelos trechos recebidos. Ainda faltam fontes literais para verificar parcelas centrais da cobertura declarada, especialmente receitas, reúso histórico, descoberta/build e resolução.** Não identifiquei, nos trechos disponíveis, contradição factual demonstrada que justifique `FIX-FIRST`. A pendência é de evidência; não se exige reescrita do candidato antes de esclarecer esses pontos.

### Resultado por critério pertinente

| Critérios | Decisão neste lote | Localização e justificativa |
|---|---|---|
| **GO-A1, CC3** — entendimento transferível; propósito, comportamento, contrato e impacto | **REQUEST_EVIDENCE** | R1–R7 explicam decisões e consequências, mas R3 e R7.3 dependem de E11–E13 e E22–E23, ausentes da evidência literal. Partes decisivas de R5–R6 também estão sem os respectivos ramos de implementação. |
| **GO-A2, GO-A4, GO-I1** — construção cumulativa, reúso e preservação | **REQUEST_EVIDENCE** | R0 identifica o histórico e declara o acréscimo sobre ele. E01 contém apenas o cabeçalho histórico, linhas 1–5; não permite verificar os quatro pontos de entrada, as 39/38 folhas ou a interpretação do estado histórico `supported`. |
| **GO-A3, QS2, QS3** — consulta, economia de leitura e simplicidade | **PASS, restrito ao recorte** | R0 oferece navegação por necessidade; R2.3 separa sinais de conclusões permitidas; as seções ligam condições técnicas a decisões. Os aprofundamentos são localizáveis por seção e E-ID. Este resultado não valida os fatos ainda pendentes de prova. |
| **GO-A5, GO-I2, GO-I8** — atualidade, validade, autoridade e limites estruturais | **PASS, restrito ao recorte** | R0, R2.2–R2.3, R3.3 e R6 distinguem baseline, integridade, readiness, execução e correção semântica. O texto não transforma hash, marker ou estrutura em prova de verdade. |
| **GO-A6, QS1, QS5, QS6** — mecanização delimitada, fidelidade e evidência real | **REQUEST_EVIDENCE** | Há suporte direto para vários limites, mas faltam os fluxos que sustentam afirmações relevantes de R2, R4, R5–R7. Referência a um archive não recebido não equivale à inspeção de seu conteúdo pelo juiz. |
| **QS4, CC7** — arquitetura, gerados, entradas, persistência e histórico | **REQUEST_EVIDENCE** | E02 sustenta ownership e a disposição de `entry-skills.gen.ts` e dos locks. A persistência e retenção têm suporte parcial em E17; construção do banco, leitura scoped, concorrência e reúso histórico ainda precisam dos trechos indicados abaixo. |
| **CC1, AC01** — população, necessidades e lacunas reconciliadas | **REQUEST_EVIDENCE** | R0 declara 130 fontes e apresenta necessidades obrigatórias, mas não foi transportada a relação de cobertura que permite reconciliar população, papéis, necessidades e lacunas neste recorte. Não estou exigindo neste lote a conclusão de R8–R14 ou das outras populações de S1-03. |
| **GO-A7, GO-I7** — Atlas existente, fronteiras e governança | **PASS, restrito ao recorte** | O candidato não propõe Atlas paralelo, não infere publicação ou admissão e não transforma conteúdo importado em autorização. O limite informado do lock Modelina é atribuído à principal, sem alegação de verificação local do runtime Atlas. |
| **AC04** — produção sobre fontes e tratamento honesto de conflito, stale e conteúdo sem autoridade | **REQUEST_EVIDENCE** | Há tratamento concreto de versão conflitante, shim stale, falhas e limites de extração. A comprovação da produção sobre a população declarada permanece incompleta pelos pedidos abaixo. A falta de execução operacional, explicitamente fora desta fase, não fundamenta esta decisão. |

### Evidência necessária para concluir

Os pedidos abaixo são obrigatórios para fechar as respectivas afirmações; **não são solicitações de execução de produto**.

#### RE-A1 — Reúso e população

**Localização:** R0; E01; `coverage.jsonl`; referências históricas A3/A4 e projeção.

**Pergunta exata:** quais conteúdos históricos foram conservados e quais lacunas documentadas foram efetivamente cobertas por R0–R7?

- **Esperado:** correspondência verificável entre entendimento histórico, lacunas anteriores e nova produção; reconciliação da população declarada.
- **Observado:** E01 mostra somente título, camada e revisão. Os números **39 backend / 38 research**, os quatro pontos de entrada e a disposição de `supported` aparecem apenas na narrativa nova.
- **Evidência necessária:** texto histórico integral de 3.942 bytes ou seus intervalos decisivos; trechos de A3/A4/projeção que sustentam esses números e estado; entradas da cobertura relativas a R0–R7 e reconciliação dos totais **59 + 71 = 130**, com papéis, necessidades e lacunas. Não é necessário retransmitir as 130 fontes integrais para satisfazer este pedido.

#### RE-A2 — Receitas, runtimes e locks

**Localização:** R1 e R3.1–R3.3; E11–E13, indicados como existentes apenas no archive.

**Pergunta exata:** os manifests e inputs fixados sustentam as versões, mecanismos, dependências, restrições e papéis descritos nas tabelas e nos parágrafos de R3?

- **Esperado:** sustentação literal das decisões de escolha de engine/runtime e de seus pré-requisitos.
- **Observado:** nenhuma evidência literal de E11–E13 foi fornecida, embora R3 concentre **21 engines backend, cinco runtimes, cinco packs research e sete locks**.
- **Evidência necessária:** intervalos de E11–E13 que mostrem `id`, `version`, `runtime/install`, dependências, `unsupported`, features e `fit` pertinentes às afirmações; trechos específicos sobre a distinção scip-typescript/TypeScript oracle, toolchains de Go/Rust e origem VSIX. Para os locks, fornecer a projeção verificável dos campos que fundamentam as afirmações sobre `resolved`, `integrity`, bundled e install scripts, identificando cada input.

#### RE-A3 — Aquisição e guards: ramos ainda ausentes

**Localização:** R2.1–R2.4 e R4; `backend-toolkit/index.ts`, `hosted.ts`, `project-version.ts`, `cassandra-metadata.ts`, E03, E07–E10.

**Pergunta exata:** quais ramos sustentam os limites de preparação, ambiente de instalação e validação/compatibilidade que o corpo apresenta como observações?

- **Esperado:** separar garantias efetivamente implementadas de comentários ou expectativas.
- **Observado:** a evidência confirma readiness, cooldown, `npm ci`, flags pip, pós-condição de source build e comparação de versões. Não mostra a detecção das formas de `$BACKEND_TOOLKIT_BIN`, o waiter de 60 segundos, a construção do ambiente allowlist, os limites de processo, a gramática/configuração do guard nem a preparação completa do overlay Cassandra.
- **Evidência necessária:** intervalos das rotinas `prepare`, construção do ambiente e execução hosted; rotinas de parsing/limite de configuração de `project-version.ts`; trechos de `cassandra-metadata.ts` que verificam os demais inputs, aplicam `replace` em staging e preservam licença/notices. Para o dialer, fornecer os ramos dos modos exclusivos e da resposta CONNECT limitada, além dos validadores já recebidos.

#### RE-A4 — Planning, build, identidade e persistência

**Localização:** R5–R6; E14–E18; `research-toolkit/index.ts` e `code-index/{shard,build,store,extract}.ts`.

**Pergunta exata:** como os ramos completos distinguem plano vazio, falha de observação, ausência de engine, fallback estrutural, cache presente e build efetivamente concluído?

- **Esperado:** evidência dos caminhos que decidem cobertura, freshness e significado dos estados.
- **Observado:** estão demonstrados adapter default, absorção de erro de plan no warm, prewarm detached, existência simples do SQLite, retenção permissiva e leitura efetiva do worktree. Não estão demonstrados vários controles e condições que completam essa explicação.
- **Evidência necessária:** intervalos de `caps()` e `pack-not-shipped`; derivação/expiração dos estados de shard; descoberta de projetos e tratamento de órfãos/`.pyi`; leitura Git e caminhos de `source_unavailable`; memoização e singleFlight de `build.ts`; escrita transacional/publicação e leitura scoped de `store.ts`; trecho completo da seleção/falha de indexers e do guard de HEAD em `extract.ts`. Preservar contexto suficiente para verificar a ordem entre disponibilidade de indexers e fallback.

#### RE-A5 — Parsers e resolução

**Localização:** R7.1–R7.3; E19–E23; `filter.ts`, `tree-sitter.ts`, `scip.ts`, `enclosing.ts`, `callers.ts`, adapters de linguagem, `resolve.ts` e `rank.ts`.

**Pergunta exata:** quais regras implementadas sustentam as inclusões/exclusões, associações de símbolos e limites de resolução descritos em R7?

- **Esperado:** suporte aos limites que determinam o que um consumidor pode concluir do índice.
- **Observado:** E19 demonstra estados de parse; E20 demonstra arquivo regular, chave do memo e fallback de encoding; E18 demonstra `opaque: false`. Faltam as regras de seleção/definições, a associação por enclosing, a canonicalização e toda a evidência literal de resolução/rank.
- **Evidência necessária:** intervalos decisivos de E19–E23, incluindo limite de tamanho e filtros, regras relevantes de export/import, validação/conversão de spans, limite/evicção do memo SCIP, matching de enclosing/canonicalização, branches de resolução por linguagem e cálculo de rank. Não é necessário enviar fixtures repetitivas para comprovar esses fluxos.

### Pontos já sustentados que devem ser preservados

- **R2.2–R2.3:** `.complete` e readiness são condições distintas. E06, linhas 51 e 69–75, e E03, linhas 266–278, sustentam essa distinção.
- **R4.1:** metadados presentes e incompatíveis não ganham validade por o bundle ser mais novo. E09, linhas 61–75, sustenta o conflito descrito.
- **R5:** plano vazio não demonstra trabalho realizado. E14, linhas 103–108 e 164–169, sustenta o limite.
- **R6.2:** retenção por budget não impõe um teto absoluto quando resta um commit. E17, linhas 203–208, sustenta o limite.
- **R7.2:** a persistência explícita de `opaque: false` impede usar esse campo como certificado de inexistência de opacidade. E18, linhas 286–295, sustenta a ressalva local.

### Sugestão opcional

Em R7.2, tornar inequívoco se “no máximo dois dumps por path, mtime e tamanho” significa **dois dumps no memo global, identificados por path e validados por mtime/tamanho**. O trecho recebido mostra uma entrada por path, mas não inclui a política de evicção. Esta sugestão não é condição independente de aceite.

**Obrigações preservadas:** este parecer não conclui AC02/03/05/06/07/08/09/10, os 50 IDs globais, outras fatias ou binding de runtime. O oracle reservado ainda não foi recebido diretamente da principal; não presumi seu conteúdo nem o substituí por material de autoria ou relay.
