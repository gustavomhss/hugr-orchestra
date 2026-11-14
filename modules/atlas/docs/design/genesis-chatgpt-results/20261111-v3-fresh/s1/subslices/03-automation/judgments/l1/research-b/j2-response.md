## REQUEST_EVIDENCE — research-b, R8–R14

**J2 — completude/utilidade.** Recebidas as sete partes e **FIM_DO_LOTE**. Este parecer cobre o recorte de `producers/research/body.md` a partir do byte declarado **35158 até EOF**, com a evidência literal apresentada. Os pedidos de **research-a** continuam abertos; os dois recortes não recebem aceite conjunto por terem completado o transporte.

O conteúdo oferece uma explicação útil das diferenças entre resultado, custódia, admissão, registro e publicação. Os trechos apresentados sustentam vários limites importantes: stale e dirty overlay, caps de cobertura, precedência do verdict, revalidação de binding, charge idempotente, custódia vinculada a evento, ambiguidade de quote e publicação incerta. **Ainda faltam evidências decisivas para confirmar contratos relevantes de probes, views/inquiry, cobertura declarada e alguns caminhos de consulta e retenção.**

Não há contradição demonstrada suficiente, nos trechos recebidos, para determinar **FIX-FIRST**.

### Avaliação por critérios pertinentes

| Critérios | Localização | Avaliação e fundamento |
| --- | --- | --- |
| GO-A1, GO-A2, QS2, QS3 | R8–R12; tabela R14 | **Favorável no conteúdo observado.** O texto permite transferir entendimento para decisões concretas e preserva distinções que evitam falso sucesso ou autoridade indevida. |
| GO-A3, GO-A4, QS6 | Referências E24–E46; R13–R14 | **REQUEST_EVIDENCE.** A navegação para aprofundamento existe, mas partes centrais do mecanismo estão apenas referenciadas. |
| GO-A5, GO-A6, GO-I2, GO-I7, GO-I8 | R8.1–R8.3, R9.2, R11–R12 | **Atendidos no enquadramento observado.** Freshness, alcance, integridade, autoridade de execução e verdade proposicional permanecem distintos. O texto hostil é tratado como dado. |
| QS1, QS5, CC3 | R8–R12 | **REQUEST_EVIDENCE.** Há boa delimitação de observação e inferência, mas a evidência recebida ainda não permite confirmar todos os contratos que orientam uso e manutenção. |
| QS4, GO-I1, CC7 | R11–R13 | **Parcialmente sustentados.** Eventos, bytes e revisões são diferenciados; os trechos de custódia e CAS são úteis. A disposição integral e parte dos mecanismos de persistência ainda precisam de evidência. |
| CC1, AC01 | R13 e “Escopo AC-01/AC-04” de R14 | **REQUEST_EVIDENCE.** A afirmação de que população, necessidades e desconhecidos estão reconciliados não se demonstra pela declaração de cobertura. Reaplica-se RE-A-01, agora considerando o corpo completo. |
| AC04 | R8–R12; R14 | **REQUEST_EVIDENCE sem exigir runtime.** O corpo trata concretamente stale, conflito, fonte parcial, publicação incerta e conteúdo hostil; a produção sobre toda a população e alguns ramos decisivos permanecem por verificar. |
| GO-A7 | R10–R14 | **Compatível com a fase.** Não há autorização inferida para criar runtime paralelo ou operar Atlas. A descrição das portas não prova integração ou consumo efetivo. |

### Evidência necessária

**RE-B-01 — Semântica das queries e alcance do overlay**  
**Localização:** R8.1; E24–E25.

**Pergunta:** quais ramos sustentam a base reportada, a seleção por id/posição/nome e os limites efetivos do overlay em cada tipo de consulta?

**Falta:** intervalos de `code-index/types.ts` com os tipos e limites declarados; de `query.ts`, a montagem de `basis`, normalização de path, seleção de definition e implementations, e os ramos de references/callers/callees/imports/map que sustentam as diferenças descritas. Para a alegação de fallback ao shard retido “mais novo”, falta a origem/ordenação de `records` que alimenta o `previous.find`.

**Já sustentado, sem novo pedido:** E24 demonstra escolha de fallback, marcação stale, tentativa detached e ausência tratada como building/unavailable; E25 demonstra substituição de símbolos dirty nas listagens apresentadas.

---

**RE-B-02 — Busca, verificação de ranges e liveness**  
**Localização:** R8.2–R8.3; E26–E28.

**Pergunta:** os caminhos completos preservam os limites e as recusas que o consumidor é orientado a considerar?

**Falta:**

- Em `search.ts`, constantes/modos de argv, parsing de JSON e tratamento de stream inválido, paginação e corte de snippet que sustentam 8 MiB, literal default e preservação UTF-16.
- Em `locate.ts`, admissão e verificação dos ranges antes de chamar `valid`, orçamento de vizinhos, limite máximo de resultados, fallback lexical e finalização de `coverage/bounds/discarded`. E27, linhas 228–230, verifica a posição e o texto de `check`; sozinho não demonstra toda a afirmação “cada range candidato é conferido” quanto aos bounds do range completo.
- Em `liveness.ts`, `check` e o fluxo de `probe/request`, com os limites, HEAD→GET, timeout, redirects, schemes e uso de `allowed`. Os trechos atuais não permitem confirmar a alegação negativa de que `check` não aplica essa helper nem o fluxo completo de proteção de rede.

Não solicito consultas HTTP reais.

---

**RE-B-03 — Probes: contrato fechado, preparo e processos**  
**Localização:** R9; E29–E33.

**Pergunta:** quais trechos implementam os runners admitidos, a seleção de snapshot/runner e os limites de execução apresentados como contrato local?

**Falta:**

- `probe/types.ts`: união de runners e campos de entrada; `probe/run.ts`: `slot`, montagem do resultado/URI e restante do fluxo pertinente à devolução sem retenção automática.
- `probe/snapshot.ts`: seleção commit/worktree, seleção de arquivos, limites de tamanho, dirtyDigest e tratamento de arquivos desaparecidos. O trecho recebido confirma symlinks de dependências, mas não esses caminhos.
- E30, implementação de `ResearchProcess.environment/run`: filtragem de ambiente, hard cap/cauda, timeout, sinais de overflow/memória e encerramento.
- E32–E33, `assets.ts`, `runners.ts` e `typecheck.ts`: validação do runner por pacote/realpath, argv por linguagem, restrições de paths e parsing/limite dos diagnósticos.

**Já sustentado:** E29 confirma restrição de plataforma, cálculo do timeout de execução, uso direto de `Probe.Limits.scratchBytes`, valores de contexto para heap/RSS e precedência do verdict. A qualificação do jail e de seus donos externos permanece fora desta decisão.

---

**RE-B-04 — Binding, allowance e leitura retida**  
**Localização:** R10–R11; E34–E38.

**Pergunta:** quais ramos sustentam os limites de identidade e retomada além dos checks locais já apresentados?

**Falta:**

- `binding.ts`: seleção da localização/worktree e validação da parte persistida no formato legado.
- `allowance.ts`: bind repetido idêntico, compatibilidade com registros antigos e tratamento de falha que fundamenta `publication_uncertain` e propagação de interrupção.
- `artifacts.ts`: derivação/verificação dos diretórios, recusa de symlink/arquivo não regular e verificação de tamanho na leitura; decodificação e validação do cursor de `read`; `verifySource` para fonte parcial/binária.

**Já sustentado:** E34 confirma checks de identidade importantes; E35 confirma charge e reconciliação sem crédito; E37 confirma evento único, correspondência manifest/receipt/bytes e UTF-8 integral; E38 confirma intent estável e escrita com hardlink sem substituição. Não é preciso repetir esses trechos.

---

**RE-B-05 — Registros, aquisição, views, inquiry e seat**  
**Localização:** R10.1, R11.3, R12; E36, E39–E43.

**Pergunta:** quais trechos confirmam os requisitos de entrada e a seleção durável usada por essas portas?

**Falta:**

- `records.ts`: leitura paginada integral da fonte para evidence; remapeamento por `lineStart`; validação de evidence/contrary/relation/findingRefs antes do commit.
- `beginAcquisition`: registro inicial antes da ação live e ligação do retorno retido à fonte admitida. E41 demonstra as recusas de replay incerto ou sem fonte, mas não o caminho inicial.
- Implementações de views/find: limites, cursor vinculado ao snapshot, conflito stale, procura do 101º match e cálculo de complete.
- `ledger.ts` e `records.ts`: seleção de dispatch mais recente em `closed`, filtragem de charges e intervalo completo da validação de estado de inquiry. O trecho E42 confirma as recusas após close e de eventos únicos repetidos; não basta para verificar a afirmação negativa de que check/close não exigem opened em outro ponto do caminho.
- E43, `seat-tools.ts`: declaração de seat e listas pertinentes.

**Já sustentado:** validação de quote/JSON locator, CAS mostrado, razão para revisão de finding, replay de captura e restrição dos links Markdown. Não solicito prova de verdade proposicional, que o corpo corretamente não atribui a esses validadores.

---

**RE-B-06 — Disposição integral e contratos de teste**  
**Localização:** R13–R14; E44–E46; `coverage.jsonl`.

**Pergunta:** as 130 fontes têm disposição individual coerente com o corpo, e os grupos de teste sustentam os contratos que a tabela lhes atribui?

**Falta:** a reconciliação solicitada em **RE-A-01**, agora para R0–R14, e a projeção de E44–E46 com expectations decisivas para os contratos enumerados. Priorizar casos que fixam fronteiras: readiness com marker/binário ausente; stale/dirty e encoding; retenção acima do budget; corrupção/symlink; conflito de binding/replay/CAS; fonte parcial e locator ambíguo.

Não é necessário executar testes, expandir fixtures externas para dentro da população ou provar todos os comportamentos de linguagem. O pedido verifica **o conteúdo dos contratos de teste afirmados**, respeitando o guard informado.

### Correções e estado

**Defeito obrigatório comprovado no corpo:** nenhum por ora. Os seis pedidos identificam lacunas de evidência e não pressupõem que as implementações contrariem o texto.

**Sugestões opcionais:** nenhuma condicionante adicional.

A decisão permanece **REQUEST_EVIDENCE** para research-b e para a união research-a/research-b. Execução de produto, Atlas, consumidores, manutenção, obrigações **AC02/03/05/06/07/08/09/10**, 50 IDs globais e binding de runtime continuam separados deste julgamento semântico.