## REQUEST_EVIDENCE — boundaries

**J2 — completude/utilidade.** Recebidas as três partes e **FIM_DO_LOTE**. Parecer sobre o corpo integral de `producers/boundaries/bodies/boundaries.md`, SHA-256 `c557b33392cae8d0078a7da17f3421bb57ec2434f3bf5bba3b54f4172faeadae`, e R001–R041.

O corpo delimita bem a autoridade do Core: adaptadores não qualificam engines; decisões não equivalem a recibos; view não executa settlement; mudança de Session não é uma transação entre filesystem e evento. A separação entre navegação e dependência aceita também está clara. **Faltam intervalos decisivos para confirmar parte das implementações e a disposição declarada. Não há defeito material comprovado para FIX-FIRST.**

### Critérios

- **GO-A1/A2, QS2/3:** favoráveis na estrutura, utilidade e encadeamento.
- **GO-A5/A6/A7, GO-I2/I7/I8:** limites adequados no texto observado; nenhuma garantia operacional apropriada dos donos externos.
- **GO-A3/A4, QS1/4/5/6, GO-I1, CC1/3/7, AC01/04:** **REQUEST_EVIDENCE**, conforme abaixo.

### Evidência exata ainda necessária

**RE-BND-01 — População, testes, histórico e navegação**  
**Localização:** abertura e §7.

**Pergunta:** quais disposições individuais confirmam as 14 implementações e dez testes, e quais bytes históricos sustentam o reúso declarado?

**Falta:** recorte das 24 entradas de `coverage.jsonl`, reconciliação com a população de 128 deste produtor, trechos T01–T03 que sustentam os contratos de teste mencionados e intervalos pertinentes do histórico/manifesto preservado. Fornecer também S01/README e a proposta de navegação quando o respectivo lote estiver disponível. Não é necessário antecipar aceite dos donos externos.

---

**RE-BND-02 — Atlas: seleção, execução limitada e delegação**  
**Localização:** §1–2; B01–B02.

**Pergunta:** quais caminhos sustentam a seleção da raiz/indexador, os limites e o pertencimento das perguntas ao lote?

**Falta:** em `atlas.ts`, seleção da raiz na layer; **152–195**, referentes ao indexador; schema **208–218** e seleção/tratamento de perguntas anterior a 259; implementação de mining **312–347**, incluindo clamp, concorrência e omissão de falhas.

R002–R004 já demonstram tradução de exceção, injeção de projeto, ausência de store e a diferença entre validação de `answer` e `why`. O comentário de R005 não substitui os ramos de mining.

---

**RE-BND-03 — Relay: paths, chave, execução e recuperação**  
**Localização:** §3; B06–B10.

**Pergunta:** quais operações completam os contratos de detecção, custódia de chave e execução/registro?

**Falta:**

- `relay-commands.ts`: detecção por linguagem/manifesto, raízes pytest, limite de 200 e tratamento de falha de leitura.
- B07 de `relay.ts`: composição dos paths, validação de install, checks de filesystem e criação/leitura da chave.
- `relay.ts`: **240–246** e continuação do helper Git para completar opções/limites; **319–334** para timestamp/append; **390–418** para ordem registro→remoção do lock; continuação de trial/check em **434–481**.

R016 já sustenta que pass sem registro vira unavailable; R017 sustenta o critério local de recuperação; R018–R019 sustentam trust de trial e recusa de settlement genérico para workflow.

---

**RE-BND-04 — Instalação e shipping de hooks**  
**Localização:** §4; B11–B14.

**Pergunta:** quais ramos sustentam continuidade de identidade, leitura segura e contagem honesta da recuperação?

**Falta:** em `relay-hook-install.ts`, operações de install/update/pause/republicação/remove em **1–215**; conclusão do reparo **240–252**; trecho omitido **274–282** do grafo; `load/parse` que verifica arquivo, estabilidade, UTF-8 e unicidade. Em `relay-hook-shipper.ts`, seleção/ordenação inicial, construção do receipt e função de stamp; em `relay-hook-recovery.ts`, continuação **65–88** para paginação, `attemptedSessions` e tratamento de erros.

Os trechos recebidos já demonstram pin/digest, várias regras do grafo, escrita temporária, lock local, exclusão por `inFlight`, absorção por grupo e escopo implicit-local.

---

**RE-BND-05 — Workflow: aquisição, view e settlement autenticado**  
**Localização:** §5; B15–B20.

**Pergunta:** a cadeia completa mantém as identidades e limites afirmados antes de adquirir, projetar, avaliar ou reparar?

**Falta:**

- `relay-workflow-binding.ts`: **62–128** para checksum, compilação, skills/checks e reconsulta final; **149–222** para coleta/deduplicação de referências e resolver.
- `relay-workflow-currentstep.ts`: **49–68** e continuação após 90, para materialização, pending, projeção de conhecimento, expansão de parâmetros e marcação de texto não confiável.
- `relay-workflow-session.ts`: registro/finalizer do host e caminho de reconcile não apresentado.
- `relay-workflow-transition.ts`: **35–66** e helpers de checkpoint/clear, para revalidação antes da leitura, identidade e escrita.
- `relay-workflow-evaluator.ts`: **29–49**, **71–105** e **150–169**, para aquisição do lock/modo, produção do recibo e validação da disposition fonte.

R031–R032, R035–R041 já sustentam partes importantes de pin/revalidação, âncoras, continuidade restrita, fence anterior ao checkpoint e reparo condicionado a evidência autenticada.

---

**RE-BND-06 — MoveSession e schema RAG**  
**Localização:** §6; B03–B05.

**Pergunta:** qual é exatamente o escopo das alterações preservadas e quais tabelas/índices sustentam a descrição de persistência?

**Falta:** trecho anterior à linha 87 de `move-session.ts` que verifica projeto e resolução de destino; `rag-studio/sql.ts` **12–71** para tabelas, chaves e índice location/path.

**Esclarecimento necessário:** “preservando … alterações não envolvidas” precisa ficar ancorado ao escopo efetivo. R007 chama `discard` por diretório, com `index: "preserve"`, sem passar o patch capturado. Fornecer T01 ou contrato aceito do dono Git que sustente a preservação pretendida; se a frase significa somente alterações fora desse path, delimitar isso. O trecho não demonstra preservação de mudanças concorrentes posteriores à captura dentro do mesmo diretório.

A ordem aplicação→evento→discard e a falha posterior do reset estão diretamente demonstradas; não solicito execução nem garantia de quiescência dentro desta função.

**Estado:** **REQUEST_EVIDENCE**. Permanecem distintas a suficiência deste L1, a seleção de versões externas, o binding e a operação real.