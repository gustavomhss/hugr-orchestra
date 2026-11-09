# G2.2 — host observer + incremental rebuild executor acceptance contract

Status: **PREPARATION; NOT A DISPATCH OR SPEND AUTHORIZATION.**
Decisão do Astra (GPT-6 Astra, browser, 2026-11-09), extraída verbatim e frio-verificada pelo lead
contra git/gh._snapshot lido: `snapshot-genesis-20261109` @ `15a6a66752c1b02994a65f1a54005d3622654aaa`.
Implementação segue esta decisão literalmente; divergências exigem nova decisão do Astra.

## 1. Semântica do observador — DECIDIDO

### 1.1 Interface e compatibilidade
Novo observador produz `OwnershipInputObservation` diretamente de FS/Git; o oracle antigo permanece
como adaptação para leitores `string | undefined` (`present→version`, `absent→undefined`,
`unavailable→undefined`). Conversão inversa proibida: `undefined` do oracle antigo não vira `absent`
(também representa chave inválida, caminho recusado, tamanho excedido, falhas de leitura).
Fontes: `ownership-input.ts:8–33`, `read.ts:17–22,61–65`.

### 1.2 `file:<caminho>`
- `present(version)`: chave válida, raiz estabelecida, caminho contido e permitido, regular e sem
  symlink no percurso, leitura completa e limitada **dos mesmos bytes do descritor**, sem instabilidade.
- `absent`: consulta de existência estabeleceu que o caminho não existe sob raiz válida e ancestrais
  verificáveis. **Não** decorre de falhar ler o conteúdo. Procedimento: validar raiz e percurso;
  localizar o primeiro componente inexistente por consulta de metadados, corroborada por enumeração
  bem-sucedida do ancestral existente e verificações de identidade do diretório. ENOENT de leitura
  genérica não basta; EACCES/EPERM/EIO/ENOTDIR/ELOOP não são exclusões.
- `unavailable`: não foi possível estabelecer presença legível ou ausência (erro de acesso/I·O,
  caminho inválido, tipo não permitido, symlink, limite excedido, raiz inválida, instabilidade).
  Arquivo encontrado que some durante abertura/leitura → `unavailable` (instabilidade); captura
  posterior pode estabelecer `absent`.
- Versão: preservar a identidade atual — `id({ kind: "ownership-source", version: 1, bytes })` —
  identidade de bytes pelo mecanismo do kernel; não é timestamp, tamanho, conteúdo normalizado ou
  Git blob SHA. Limite congelado 256.000 bytes; arquivo vazio é `present`; a captura precisa limitar
  os bytes efetivamente lidos (o código atual verifica tamanho antes de `readFileSync`).
  Fontes: `ownership-input.ts:25–28`, `canonical.ts:104–114`.

### 1.3 `members:<diretório>` — versão explícita de presença efetiva (v2 obrigatória)
`members:` passa a representar arquivos Git-elegíveis **e** efetivamente presentes, num diretório de
seleção declarado pela receita. Seleção: `git ls-files --cached --others --exclude-standard -z --
:(literal)<diretório>`. Regras: exigir diretório existente/acessível/permitido; exigir enumeração Git
bem-sucedida (sem timeout/truncamento/diagnóstico); validar saída NUL-delimitada sem substituição
silenciosa; dedupar; verificar cada candidato (presente+permitido → na lista; ausência estabelecida →
fora; erro/symlink/tipo não permitido → observação inteira `unavailable`). Sort + hash como
`id({ kind: "ownership-membership", version: 2, bytes })` — **version 2 obrigatório** (significado
mudou; não conservar identidade v1).
Casos: diretório existente com membros → `present(hash)`; existente vazio → `present(emptyHash)`;
diretório comprovadamente inexistente → `absent`; inacessível/enumeração incompleta → `unavailable`.
Mudança só de conteúdo → membership igual (o `file:` detecta). Remoção só working tree mantendo
índice → candidato sai da lista efetiva. Recriação elegível → volta à lista. Universo continua a
seleção Git declarada; arquivo obrigatório independente da seleção exige binding `file:` explícito.
O seam Git atual devolve só stdout no sucesso: o contrato exige **variante de leitura estrita** no
mesmo módulo, sem alterar semântica dos callers existentes. Fonte: `run-git.ts:31–42`.

### 1.4 Remoção representada no próximo receipt
- Arquivo obrigatório fixo ausente → HOLD (não remover binding para fabricar sucesso).
- Arquivo de conjunto dinâmico → receita pode reconstruir sem ele e retirar seu binding `file:`,
  somente mantendo o binding `members:v2`.
- Diretório do conjunto desapareceu → HOLD (não remover também `members:`).
- Conjunto existente vazio → receipt válido com `members:v2` da lista vazia.
Migração: receipt v1 não recebe carimbo v2 sem revalidação. Fontes: `update-plan.ts:68–71`,
`read.ts:61–65`.

## 2. Receita incremental ligada ao planner — DECIDIDO

### 2.1 Fronteira do bloco
Executor recebe baseline, scope, registro explícito de receitas, acesso host/CAS; chama
`planOwnershipUpdate` internamente; devolve candidato privado completo e validado OU `OwnershipRefusal`.
Não aceita `affected` do caller como autoridade; não publica; não altera a projection. F1/F3: ativação,
recuperação e migração ficam em F3. CAS por si só não publica ownership no caminho atual.

### 2.2 Registro da receita e regra de reuse
Cada receita declara, antes da execução: artifact key+scope; arquivos obrigatórios (intent +
implementação/configuração); seleções `members:` e política; dependências required; contrato de
avaliação e identidade da implementação executada. Bindings construídos da declaração + capturas
efetivas (não apenas do relato pós-execução). Precedente: o pilot vincula o código executado
(`ownership-pilot.ts:56–59,79`). Reuse apenas quando coincidem: artifact/scope + identidade da receita
executada + contrato + bindings externos completos + resultados dos required + receipt/reviews/result
íntegros. Para F1, o baseline fornecido e verificado é a fonte de reuse; sem cache global novo. Dedup
de `store.put` **não** conta como zero-call reuse.

### 2.3 Ordem exata de execução
Sequencial na ordem `plan.affected`: (1) validar baseline + declarações (omissões → HOLD; baseline
sujeito à validação completa de G2.1); (2) capturar observações + chamar planner (wrapper conserva
bytes/listas; cache por chave dentro do plano permanece); (3) resolver entradas novas de membership
(capturar arquivos recém-descobertos que a receita vai consumir); (4) **preflight fresco** antes da
primeira receita (divergência → HOLD, sem execução, sem replanejamento); (5) reusar `unaffected`
(refs preservadas; verificações mecânicas permitidas; receita/interpretação/avaliação não); (6)
percorrer `affected`; por artefato, `precisaRevalidar = mudou próprio binding externo OU mudou algum
required result` — se falso, preservar o artefato inteiro (inclusive nós afetados só por propagação
potencial interrompida por igualdade de resultado); se verdadeiro, executar receita sobre capturas
imutáveis (bytes/listas capturados + resultados resolvidos dos pré-requisitos; sem reabrir caminhos
do host); (7) rechecar inputs após produção e antes da avaliação (drift → HOLD; não gastar avaliação);
(8) obter revalidação válida para bindings atuais (não reutilizar reviews antigos com inputs novos —
o reader vincula reviews a `id({inputs, dependencies})`, result e contract); (9) persistir cadeia
válida e comparar o resultado completo; (10) rechecar a geração inteira antes de devolver (incluir
inputs de reutilizados e memberships); (11) devolver candidato privado ou HOLD — nunca parcial.
`frontier` = primeiro conjunto elegível para revalidação, não permissão de executar todos os
descendentes.

### 2.4 Quando chamar / não chamar
Critério de parada: `newResultRef === oldResultRef` sobre o `OwnershipResult` **completo** (body,
authority, validity, gaps, evidence) — não body-only (RP-5 mostra body igual + authority diferente ⇒
outra identidade, `types.ts:18–30`, `ownership-update.test.ts:83–85`). Receipt-only renewal: nó
revalidado, result igual, novos bindings aprovados; renovam-se receipt/reviews e o artifact que aponta
para eles; filhos com binding próprio inalterado conservam refs (deps apontam para result; RP-5
conserva receipt do filho, `types.ts:50–56`, `ownership-update.test.ts:64–69`). Timestamps/contadores
ficam no registro de execução, não no result. Casos: próprios bindings iguais + required results
iguais → zero chamadas; próprio input/intent/receita mudou → revalidar; ≥1 required mudou → revalidar
após todos os pré-requisitos resolvidos; pai renovou receipt mantendo result e filho sem mudança própria
→ não chamar o filho; um pai manteve result e outro mudou → revalidar o filho uma vez após ambos;
input obrigatório indisponível/ausente, avaliação recusada, resultado bloqueado → HOLD; mudança
arbitrária no grafo/contrato → HOLD (F1 mantém esses elementos fixos).

### 2.5 "Receita real" na aceitação
Suite executa receita determinística pequena com transformação efetiva dos inputs capturados;
contadores observados pelo harness nas chamadas efetivas (não `calls: 0` declarado); reviews de teste
com proveniência mecânica explícita; rotas de modelos reais seguem subordinadas ao contrato de admissão.

### 2.6 Superfície de implementação
`adapter-io/src/ownership-input.ts` (tri-estado + adaptação old); `adapter-io/src/run-git.ts`
(variante estrita preservando diagnóstico/completude, sem mudar callers); **novo**
`adapter-io/src/ownership-rebuild.ts` (planner→captura→reuse/revalidação→candidato);
`knowledge/src/index.ts` (exportação mínima planner+tipos); testes do observador/rebuild + fixture de
receita; este contrato + lane. **Não** alterar algoritmo de `update-plan.ts`, shapes de ownership ou
reader para tombstones. (Barrel atual exporta reader e tipos de ownership, mas não o planner —
`index.ts:15–18`.)

## 3. Linha vermelha exata — DECIDIDO

Baseline com seams novos tipados e ainda não implementados; testes novos devem falhar em suas chamadas
ao seam ausente (falha de import/compilação/coleta **não** substitui falha nomeada). Nenhum negativo
aceita “qualquer exceção” — exige hold/unavailable específico. Após implementados, testes distinguem
implementações incorretas por mutações.

### 3.1 Fixture e oráculos
Grafo principal `z → a → m`, `i` independente, + segundo scope no mesmo disco para isolamento. Ordem
contraria a alfabética (captura CE1). `z` consome `members:src/core` + arquivos; `a` também consome
intent próprio. Cada receita tem identidade própria. Três mudanças distintas: (1) bytes diferentes,
resultado igual; (2) resultado do pai diferente, filho igual; (3) resultado semanticamente diferente
propagado. Conjuntos/bodies esperados são constantes do teste (não calculados pelo planner).

### 3.2 Observador — 12 testes
| Nome | Asserção |
|---|---|
| HO-01 file present hashes exact bytes | Regular retorna `present` com id dos bytes; alterar bytes altera versão; sem mtime. |
| HO-02 file ceiling applies to bytes actually read | 0 e 256.000 aceitos; 256.001 e crescimento além do teto durante captura → `unavailable`. |
| HO-03 absent requires a verified negative lookup | Inexistente comprovado sob raiz válida → `absent`, sem versão inventada; raiz inválida não vira ausência do arquivo. |
| HO-04 read errors never become absence | EACCES/EPERM/EIO/ENOTDIR e desaparecimento durante captura iniciada presente → `unavailable`, não `absent`. |
| HO-05 invalid escaped and nonregular inputs are unavailable | Namespace desconhecido, traversal, caminhos proibidos, symlink final/intermediário, não-regular → recusados. |
| HO-06 members v2 describes Git-eligible live files | Dedup/ordem do stdout não alteram versão; mudança de conteúdo não altera membership; adição elegível altera; untracked ignorado fora do universo. |
| HO-07 empty scope is present and missing scope is absent | Diretório existente vazio → versão estável da lista vazia; comprovadamente inexistente → `absent`; erro de acesso → `unavailable`. |
| HO-08 unstaged deletion and eligible recreation change members | Remoção só do working tree altera membership mantendo o índice; recriação elegível restaura a lista. |
| HO-09 an unobservable candidate invalidates membership | Candidato com erro de verificação ou symlink → observação inteira `unavailable`; não silenciosamente descartada. |
| HO-10 incomplete Git enumeration is unavailable | Exit não zero, diagnóstico com exit zero, timeout, truncamento, saída malformada/encoding inválido → não produz versão. |
| HO-11 legacy oracle projects tri-state without inventing absence | `present(v)→v`; `absent`/`unavailable`→`undefined`; classificação nova não deriva do retorno antigo. |
| HO-12 membership policy versions cannot alias | Mesma lista sob v1 e v2 → versões distintas; nenhum receipt v1 apresentado como já validado para v2. |

Erros de sistema difíceis de produzir consistentemente no runner são injetados na costura estreita de
FS/Git; conteúdo/membership/remoção/recriação usam FS/Git reais.

### 3.3 Executor — 20 testes
| Nome | Asserção |
|---|---|
| RB-01 unchanged generation reuses with zero calls | Baseline atual retorna mesmo manifest e refs; zero chamadas de receita, interpretação e avaliação. |
| RB-02 source edit rebuilds the independently expected closure | Mudança semântica em fonte de `z`: `affected=[z,a,m]`, `frontier=[z]`, `unaffected=[i]`; receitas efetivas em `[z,a,m]`; bodies e bindings novos corretos. |
| RB-03 source addition is consumed and bound | Novo membro entra no body derivado e nos inputs do receipt; membership atualizado. |
| RB-04 unstaged source removal completes a guarded rebuild | Arquivo removido do working tree deixa de participar do body e do receipt; `members:v2` permanece como guarda; candidato completo valida. |
| RB-05 accepted removal remains stable and detects recreation | Candidato da remoção como baseline: ausência persistente → zero calls; recriação elegível dispara rebuild e restaura o binding `file:`. |
| RB-06 intent edit rebuilds only its required closure | Alterar intent de `a` seleciona `[a,m]`; `z` e `i` preservam refs e zero chamadas. |
| RB-07 recipe change executes the newly bound implementation | Segunda versão real da receita de `a` altera seu binding, executa essa versão e produz o resultado esperado; não executar código antigo com versão nova. |
| RB-08 equal result renews receipt and stops downstream calls | Mudança de bytes em `z` com result igual: chama somente `z`; result preservado, receipt/artifact renovados; refs e chamadas de `a,m,i` preservados/zero. |
| RB-09 child renewal stops propagation at its unchanged result | Result de `z` muda; `a` revalida com result igual ao antigo e novo dependency binding; chamadas `[z,a]`; `m` não executa. |
| RB-10 parent equality cannot hide a direct child change | `z` mantém result, mas intent próprio de `a` muda: `a` ainda executa; não podar essa obrigação direta. |
| RB-11 all prerequisites settle before one dependent execution | `a` depende de `b` e `z`: execução `[b,z,a]`; `a` executa uma vez após ambos. Um pai igual não mascara outro diferente. |
| RB-12 full result identity controls propagation | Com body igual, mudanças em authority/gaps/evidence alteram result e exigem revalidação dependente. |
| RB-13 rejected or unbound revalidation cannot renew a receipt | Resultado bloqueado, review HOLD ou review ligado a bindings antigos → HOLD; não copiar verdict anterior nem devolver candidato pronto. |
| RB-14 an omitted declared input prevents successful rebuild | Input obrigatório removido do baseline ou do receipt construído é detectado; sem reuse/candidato válido com dependência externa invisível. |
| RB-15 an omitted required edge prevents successful rebuild | Aresta required removida é detectada; não aceitar filho sem o binding do predecessor exigido. |
| RB-16 recipe or evaluation-contract mismatch cannot hit reuse | Implementação executada diferente da vinculada, ou contrato diferente do congelado → HOLD; igualdade de body não autoriza reuse. |
| RB-17 missing mandatory input or membership root holds | Arquivo fixo obrigatório ausente ou diretório `members:` desaparecido → HOLD; não eliminar bindings para estabilizar um baseline falso. |
| RB-18 invalid baseline never dispatches work | Baseline malformado, ciclo desconectado, autorreferência ou objeto obrigatório ausente: HOLD antes de receita/interpretação/avaliação. |
| RB-19 persisted candidate supports zero-call reuse after reopen | Reabrir o CAS e usar o manifest resultante como baseline recupera objetos válidos e obtém zero calls; não reconstruir para descobrir depois o mesmo hash. |
| RB-20 preparation never activates or poisons another scope | Sucesso não muda a projection; falha intermediária não devolve candidato completo; leitura corrente do scope alterado não serve conhecimento stale; scope independente válido permanece legível. **Também exige validar todo o inventário** (attachment checker percorre roots, G2.1 percorre todos os entries). |

### 3.4 Concorrência — 5 testes
| Nome | Asserção |
|---|---|
| TC-01 drift before first dispatch invalidates the plan | Alteração entre planejamento e preflight → HOLD com zero chamadas; não reutilizar o memo do plano como recheck. |
| TC-02 drift during production rejects the captured attempt | Receita consome os bytes capturados; drift detectado depois da produção → HOLD antes de avaliar o produto. |
| TC-03 drift in a reused artifact fails the final sweep | Input de `i`, inicialmente unaffected, muda durante outro rebuild: candidato inteiro recusado; checar apenas reconstruídos não passa. |
| TC-04 membership churn cannot be silently absorbed after planning | Arquivo elegível surge/desaparece durante rebuild: nova enumeração detecta drift e causa HOLD. |
| TC-05 ABA cannot change the bytes consumed by the recipe | A→B→A durante a execução; receita continua recebendo A capturado; mesmo com rechecks passando, o produto não pode ter sido calculado de B por reabertura do caminho. |

### 3.5 Controles de mutação mínimos
`observer-error-as-absent` (HO-04), `observer-members-index-only` (HO-08/RB-05),
`observer-accept-partial-git` (HO-10), `rebuild-every-affected` (RB-08), `rebuild-return-old-result`
(RB-02), `rebuild-body-only-stop` (RB-12), `rebuild-ignore-direct-child-change` (RB-10),
`rebuild-omit-input` (RB-14), `rebuild-omit-required-edge` (RB-15), `rebuild-accept-stale-review`
(RB-13), `rebuild-skip-preflight` (TC-01), `rebuild-skip-final-sweep` (TC-03), `rebuild-read-live-path`
(TC-05). Cada rejeição ligada à asserção nomeada; processo não-zero por erro de setup não é dente.

## 4. Concorrência e TOCTOU — DECIDIDO

Contrato oferece captura por input + consumo dos valores capturados + rechecagem otimista; **não**
oferece snapshot atômico do repositório. O candidato deriva de um vetor identificado de observações; a
receita consome esse vetor; o executor re-verifica bindings nas fronteiras definidas. Fronteiras
obrigatórias: durante a captura; antes de começar o trabalho; antes de cada receita; depois da
produção, antes da avaliação; depois da avaliação e antes de devolver o candidato (varredura completa,
incluindo reutilizados e membership). Cada fase tem caches próprios; o memo de uma fase não satisfaz a
seguinte. Limites não prometidos: reabrir um path depois de calcular sua versão não é consumo do input;
descritor fixa o objeto aberto mas o contrato não presume bytes imutáveis; dois hashes iguais não provam
ausência de ABA; rechecks não fecham a janela até ativação futura; candidato privado não vira
conhecimento corrente por verificação anterior; drift detectado → HOLD, sem retry/interpretação
automática; snapshot global/exclusão mútua = precondição adicional do host (ativação verifica na sua
fronteira; F3).

## 5. Contraexemplos que justificam as decisões — DECIDIDO

1. **Erro apresentado como exclusão.** `file:x` existe, mas a leitura recebe EACCES. Converter o antigo
   `undefined` em `absent` permitiria retirar um input válido. (`ownership-input.ts:20–33`)
2. **Remoção unstaged seguida de recriação invisível.** O nome continua no índice; `members:v1`
   permanece igual. O rebuild elimina `file:x`; depois `x` reaparece e nenhuma chave restante muda.
   (`ownership-input.ts:16–18`, `update-plan.ts:61–71`)
3. **Body igual com autoridade diferente.** Comparar só texto interromperia uma propagação necessária.
   O próprio RP-5 mostra result diferente e binding dependente inválido nesse cenário.
   (`ownership-update.test.ts:83–85`)
4. **Pai igual escondendo mudança própria do filho.** `z` revalida com o mesmo result, mas o intent de
   `a` mudou. Cortar toda a subárvore perde uma obrigação direta que continua registrada em changes.
   (`update-plan.ts:60–71,77`)
5. **Um pré-requisito liberado tratado como todos.** `a` depende de `b` e `z`; `b` termina primeiro.
   Executar `a` nesse instante pode usar o result antigo de `z`. (`update-plan.ts:93–100`)
6. **Reviews antigos em receipt novo.** Alterar inputs ou required results, copiar os reviews anteriores
   e chamar isso de renovação deixa a aprovação ligada ao hash errado. (`read.ts:50–58`)
7. **ABA com leitura viva.** O executor observa A; a receita reabre o path durante B; o host volta a A
   antes do recheck. Comparações antes/depois podem passar enquanto o produto deriva de B. A decisão
   é consumir capturas, além de rechecar — nunca alegar que rechecks provam ausência de ABA.
8. **Perder também a guarda do conjunto.** O diretório declarado desaparece; a receita retira tanto
   os bindings dos arquivos quanto `members:`. A recriação futura deixa de ser observada. Neste
   contrato, desaparecimento do diretório obrigatório produz HOLD, e um conjunto vazio aceito
   conserva seu binding `members:v2`.

Acceptance delimitada à execução incremental comprovada por esses cenários, com receipts persistidos e
zero chamadas medido nas rotas de reuse; não converte o candidato em publicação nem constitui
fechamento global de AC-05/06 fora desse escopo.
