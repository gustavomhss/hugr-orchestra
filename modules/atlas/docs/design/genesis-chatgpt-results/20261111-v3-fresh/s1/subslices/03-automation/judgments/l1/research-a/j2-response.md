## REQUEST_EVIDENCE — research-a, R0–R7

**J2 — completude/utilidade.** Recebidas as sete partes e o marcador **FIM_DO_LOTE**. Este parecer cobre exclusivamente o recorte de `producers/research/body.md`, bytes declarados `[0,35158)`, e a evidência literal transportada.

O corpo oferece entendimento útil e distingue adequadamente aquisição, readiness, execução e correção semântica. Entretanto, **faltam trechos decisivos para confirmar partes substanciais das necessidades que o próprio lote declara cobrir**, sobretudo receitas concretas, planejamento/build e resolução. Os identificadores de evidência permitem localizar essas lacunas, mas não substituem os conteúdos ainda não apresentados. Não identifico, nos trechos disponíveis, contradição demonstrada que justifique **FIX-FIRST**.

### Avaliação por critérios pertinentes

| Critérios | Localização | Avaliação e fundamento |
| --- | --- | --- |
| GO-A1, GO-A2, QS2, QS3 | R0–R7; especialmente R2.3, R5 e R6.3 | **Favorável no conteúdo observado.** A organização explica mecanismos e consequências; a tabela de readiness evita conclusões indevidas. Os intermediários ajudam o leitor a decidir quando aprofundar. |
| GO-A3, GO-A4, QS6 | R0, referências E01–E23 | **REQUEST_EVIDENCE.** Há rotas de aprofundamento explícitas, mas diversas fontes decisivas foram apenas referenciadas. O reúso histórico também está afirmado além do trecho histórico apresentado. |
| GO-A5, GO-A6, GO-I2, GO-I8 | R0; R2.2–R2.5; R3.3; R5–R7 | **Atendidos no enquadramento observado.** O texto separa baseline, integridade, disponibilidade, execução e validade semântica. Não transforma hashes, markers, listas vazias ou contadores em prova de suficiência. |
| QS1, QS5, CC3 | R2–R7 | **REQUEST_EVIDENCE.** Os trechos presentes sustentam vários limites relevantes, mas não permitem verificar todas as afirmações que orientam escolha, operação e manutenção. Pedidos específicos abaixo. |
| CC1, AC01 | R0 e mapa de necessidades | **REQUEST_EVIDENCE.** A contagem declarada é aritmeticamente coerente, mas a reconciliação entre população, disposição e cobertura de R0–R7 não foi apresentada. Não concluo completude pela contagem. |
| QS4, CC7 | R1, R3.3, R6; E02 | **Parcialmente sustentados.** E02 confirma ownership, origem do gerado e natureza dos locks. Persistência e disposição completa das fontes ainda dependem dos trechos e da reconciliação solicitados. |
| GO-I1 | R0; E01 | **REQUEST_EVIDENCE.** A preservação do histórico e a distinção entre entendimento reutilizado e novo aceite são explícitas, mas E01, linhas 1–5, só apresenta seu cabeçalho. |
| GO-A7, GO-I7 | R0, R1, R3.3 | **Compatíveis com o limite da fase.** O texto não autoriza operação Atlas nem se atribui garantias dos donos externos. Isso não certifica integração ou binding. |
| AC04 | R2.2, R4, R5, R6.3, R7.2 | **REQUEST_EVIDENCE para a produção semântica declarada.** Há tratamento concreto de stale, incompatibilidade, falha e conteúdo importado com autoridade limitada. Falta verificar alguns ramos centrais; não exijo executar produto nesta fase. |

### Evidência necessária

**RE-A-01 — População, disposição e reúso histórico**  
**Localização:** R0; E01; `coverage.jsonl`.

**Pergunta:** quais fontes da população obrigatória sustentam R0–R7, e como as demais ficam dispostas nos lotes seguintes, sem omissão ou duplicação apresentada como cobertura adicional?

**Falta:** projeção literal de `coverage.jsonl` pertinente a este recorte, com a reconciliação já verificada pela principal das contagens declaradas — 59 backend, 71 research; 80 implementações, 41 testes, sete locks, um gerado e um README. Para o reúso, fornecer os intervalos históricos que sustentam os quatro pontos de entrada e a evidência de A3/A4/projeção que fundamenta as 39 folhas backend e 38 research ainda sem leitura substantiva. O cabeçalho E01 não sustenta essas afirmações.

---

**RE-A-02 — Receitas, versões e inputs de aquisição**  
**Localização:** R3.1–R3.3; E11–E13, não apresentados.

**Pergunta:** os manifests fixados confirmam cada engine/runtime, versão, mecanismo e restrição usados nas tabelas para orientar seleção?

**Falta:** intervalos E11–E13 com os campos decisivos das 21 engines backend, cinco runtimes e cinco packs research: identidade/versão, aquisição, fit, dependências e restrições relevantes. Incluir a base literal para os casos diferenciados afirmados no texto: TypeScript transitivo versus oracle, exigências de toolchain Go/Rust, opcionais do esbuild, dependências bundled de Modelina e conjunto de wheels. Não é necessário reenviar todos os locks integrais; os trechos precisam sustentar precisamente essas distinções.

O limite de 256.000 bytes atribuído ao runtime Atlas está corretamente apresentado como informação da principal e permanece uma questão operacional aberta; **não é motivo para reprovar este recorte semântico**.

---

**RE-A-03 — Contratos de aquisição e guards ainda não demonstrados**  
**Localização:** R2.1–R2.4 e R4; E03, E07–E10.

**Pergunta:** quais ramos implementam os contratos de chamada e de contenção que o leitor é orientado a usar?

**Falta:** intervalos decisivos de:

- `backend-toolkit/index.ts`: `prepare`, reconhecimento das formas de variável, espera de 60 segundos, propagação de PATH e `prefetch` com estados por engine;
- implementação que constrói o ambiente de instalação: allowlist e HOME/configs privados afirmados em R2.2;
- `hosted.ts`: argv e ambiente Go/Cargo que sustentam as propriedades de build descritas;
- `project-version.ts`: parser restrito de configuração e regras de output/caminho, além do limite de tamanho;
- `cassandra-metadata.ts` e `cassandra-dialer.ts`: instalação do overlay, seleção exclusiva dos modos e tratamento da resposta/deadline/cancelamento CONNECT.

Os trechos recebidos sustentam várias verificações locais, mas não esses contratos completos.

---

**RE-A-04 — Planejamento, fontes do build e persistência**  
**Localização:** R5–R6; E14–E18.

**Pergunta:** os caminhos reais confirmam a descoberta, a identidade, a execução e a retenção descritas, incluindo as degradações que podem parecer ausência de trabalho?

**Falta:** intervalos de:

- `research-toolkit/index.ts`: `caps()` e estado de pack canônico ausente;
- `code-index/shard.ts`: leitura Git com tratamento de erro/truncamento, descoberta de projetos, órfãos e distinção de `.pyi`;
- `code-index/build.ts`: memoização de planos, singleFlight, retorno quando há build em curso e tratamento independente das falhas;
- `code-index/store.ts`: escrita temporária/transacional, abertura de leitura e persistência/leitura do manifesto;
- `code-index/extract.ts`: admissão por plataforma, ramo anterior ao fallback estrutural, check de HEAD e chamada SCIP com os limites declarados.

E16 comprova a composição da chave; E17 comprova aspectos de existência e retenção; E18 comprova leitura do worktree e perda do sinal de opacidade. Esses trechos não cobrem, sozinhos, os demais contratos acima.

---

**RE-A-05 — Semântica de parsing, posições e resolução**  
**Localização:** R7.1–R7.3; E19–E23.

**Pergunta:** quais implementações sustentam as regras específicas de inclusão, conversão de posições, associação e resolução usadas para interpretar o índice?

**Falta:** intervalos de:

- `filter.ts` e constantes/regras estruturais pertinentes de `tree-sitter.ts`;
- `scip.ts`: `span`, conversão para UTF-16, defaults de encoding e convenções de linha/coluna;
- `enclosing.ts` e `callers.ts`: escolha de container, canonicalização e distinção de referências/imports;
- adapters Go/Python/Rust de E22, para as peculiaridades atribuídas a cada linguagem;
- `resolve.ts` e `rank.ts`, E23, para fallback de config, unresolved/package, regras por linguagem e cálculo de rank.

O trecho E19 recebido demonstra degradação com razões, e E20 demonstra seleção de encoding e memo por metadados. E21, linhas 111–135, expõe consultas e ordenação, mas não a lógica de canonicalização ou enclosing descrita no corpo.

### Correções e continuidade

**Defeito obrigatório comprovado no corpo:** nenhum por ora. Os pedidos acima são lacunas de evidência, não imputações de erro às implementações.

**Sugestões opcionais:** nenhuma condicionante adicional.

Após a evidência solicitada, reavaliarei o mesmo lote e os mesmos critérios. Permanecem abertas as obrigações operacionais **AC02/03/05/06/07/08/09/10**, os 50 IDs globais e qualquer binding de runtime. Este parecer não julga R8–R14 nem converte o histórico `s1.core.entry` em união aprovada.