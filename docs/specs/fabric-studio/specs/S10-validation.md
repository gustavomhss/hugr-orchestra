# S10 — Checks, reconciliação e evidências

**Estado:** proposta técnica; não congelada para implementação.
**Requisitos proprietários:** FS-VAL-001–007

## 1 Responsabilidade e integrações

Possui preparação de checks, comparação verificável, `CheckState` e vínculo da evidência à afirmação testada. Consome [CONTRACTS.md](CONTRACTS.md), C01–C07; não define autorização, execução de jobs, aprovação de mudança ou retenção alternativa. S02 resolve contexto/identidade; S03 qualifica operação; [S06](S06-discovery.md) resolve destinos; [S07](S07-data.md) ativa leituras; S08 fixa revisão/digest; S09 executa efeitos; S13 protege/retém evidência e S11 limita egress.
Base: [requirements](../requirements/05-evidence-and-continuity.md), Q03/Q04/Q06–Q09/Q12/Q13 e DESIGN §16. Nenhum check foi executado; os contratos propostos não demonstram implementação por stores/drivers atuais nem operação em tenant real.

## 2 Contrato

Usar somente `validation.prepare/run/get` C06. ContextRef, ResourceRef, ObservationMeta, Problem, WorkloadState, CheckState e refs Validation/Result/Command/Activation são os da seam C01/C02/C05/C08 authoring-2. EnvironmentMapRef e SnapshotDescriptor compartilham a representação decidida em C08; não criar IDs paralelos nem endpoint adicional. Estruturas abaixo são propostas readonly, campos opcionais omitidos, ainda sujeitas à compilação/integração Schema/Protocol.

| Operação | Entrada proposta | Saída proposta |
| --- | --- | --- |
| `validation.prepare` | `{context: ContextRef, statement: string, criterion: {id: ID registrado, revision: string, params: objeto estrito}, resources: ResourceRef[], environment: resolução server-side versionada, identityFingerprint: identidade resolvida esperada, population: {filter: objeto tipado, period?: intervalo tipado, sample?: método/tamanho/seed}, snapshots: descritores por fonte, baseline: referências autorizadas ou ausência explícita, revision: referência/digest exatos do trabalho}` | `{validation: ValidationRef, state: "not-run", preparedDigest: string, scope: descrição normalizada, limitations: string[]}` ou `Problem` |
| `validation.run` | `{context: ContextRef, validation: ValidationRef, expectedPreparedDigest: string, source: ActivationRef ou CommandRef compatível}` | `{validation: ValidationRef, state: CheckState, evidenceRefs: referências locais autorizadas[], problems: Problem[]}` |
| `validation.get` | `{context: ContextRef, validation: ValidationRef}` | `{validation: ValidationRef, preparedDigest: string, state: CheckState, scope: descrição preparada, evidence: evidências limitadas[], problems: Problem[]}`; leitura local não executa check/query |

`prepare` valida/normaliza sem iniciar engine. O fingerprint recebido é expectativa comparada à identidade resolvida, não autenticação fornecida pelo cliente. Snapshots descrevem versão/revisão/watermark/instante e garantias da fonte; ausência é explícita e pode impedir comparação. Baseline ausente só cabe em critério que não exija baseline. Períodos declaram limites/fuso; amostra não se apresenta como população completa. C08 distingue same-snapshot/stable-version/watermark/observed-time-only; só instante parecido não prova snapshot consistente. Revision do mapa S02 e os pares resolvidos são pinados na preparação; novas versões não mudam o check anterior.
Critério usa implementação registrada, parâmetros tipados e revisão fixada, nunca expressão JS/SQL arbitrária para produzir booleano no renderer. Se sua coleta requer query, a query exata e parâmetros entram na preparação e em S07; se produz efeito, usa revisão/Command de S08/S09. Modelo pode propor pergunta, não executar um segundo loop ou declarar o resultado.

### FS-VAL-001 — Afirmação preparada e imutável

Congelar statement, critério/revisão/parâmetros, ambientes/destinos/identidades, população/filtros/amostra, fontes/snapshots, baseline, método, limites e revisão/contentDigest do trabalho no registro preparado. `preparedDigest` segue canonicalização JCS/SHA-256 de C04 para o conteúdo completo representável. Alterar qualquer entrada cria nova preparação e invalida o vínculo do run antigo; não reinterpretar resultado depois. UI mostra pergunta, condição e alcance antes/depois do check. Ausência de critério executável é `invalid-input`/`unsupported`, não passe narrativo.

### FS-VAL-002 — Camadas independentes

Armazenar separadamente recibo/readback, `WorkloadState` remoto e `CheckState`. `accepted`/202 é admissão; readback prova somente o conteúdo/revisão observados; job `succeeded` prova seu estado remoto, não a regra de negócio. Check usa evidência específica e pode continuar `not-run`/`failed` após sucesso de job. Publicação composta consome esses estados, sem converter sucesso de etapa em sucesso global.

### FS-VAL-003 — Instrumento falho não passa

Executar critério somente após validar tipos, presença de entradas, comparabilidade e integridade da coleta. Diferenciar `failed` (critério válido refutado), `error` (coleta/instrumento falhou), `inconclusive` (evidência insuficiente/incomparável), `not-run` (não executado). Skip/timeout/erro não fornecem zero sintético. Controles conhecido-bom e conhecido-ruim precisam demonstrar que o instrumento enxerga ambos antes de sua qualificação; relatório do próprio modelo não é controle independente.

### FS-VAL-004 — Comparabilidade explícita

Antes de comparar, conferir identidade/direitos efetivos relevantes, filtros/população, período/fuso, granularidade, unidades/tipos e versões/snapshots/watermarks compatíveis. Comparação entre ambientes distintos pode ser intencional, mas exige mapeamento de população e baseline explícitos; não exigir IDs remotos iguais nem presumir dados iguais. Registrar diferença e garantia de snapshot oferecida pelo engine. Mutação concorrente sem corte comparável termina `inconclusive`, sem aprovação silenciosa.

### FS-VAL-005 — Critério adequado ao conteúdo

Critério determina a afirmação que pode provar. Igualdade de row count só comprova contagem no alcance observado. Equivalência semântica pede chaves, regras de nulidade/duplicidade, unidades e reconciliação dos valores relevantes; receita pode requerer exclusões de cancelados, período, moeda e agregação definidos no critério escolhido pelo responsável, não inventados pelo sistema. Falta de regra/pesos/população bloqueia essa afirmação, não sugere soma/média conveniente. Comparador trata precisão/tolerância declaradas, sem coerção silenciosa.

### FS-VAL-006 — Evidência correlacionada

Evidência proposta: `{validation: ValidationRef, preparedDigest: string, criterion: {id, revision, paramsDigest}, workRevision: referência exata, contentDigest: string, query: {text: conteúdo efetivamente executado, params: valores tipados} ou operação preparada identificada, observations: ObservationMeta[], resultRefs: ResultHandle[], scope: alcance efetivo, limitations: string[], state: CheckState, observedAt: instante}`. Query/parâmetros são payload sensível sujeito a S13/S11, não log público. Uma ref temporária expirada não substitui prova conservada; salvar evidência opt-in inclui o recorte necessário autorizado, não só handle morto.
Correlacionar resultado ao comando/operação/observação que o produziu quando aplicável. Evidência traz idade, modo e cobertura parcial, nunca somente narrativa/resumo. Reutilização em outra revisão/destino exige preparação nova e análise explícita; não transfere `passed` histórico. Evidência apagada/expirada mantém apenas status histórico permitido e motivo, não conteúdo ou nova aprovação.

### FS-VAL-007 — Modos sem promoção

Cada observação mantém `mode` C02: `real`, `fixture`, `demo`, `documentation`. Resultados e histórico exibem essa origem; fixtures não recebem recibo remoto fictício. Um check com entradas simuladas/mistas não comprova execução real; modos por entrada permanecem visíveis, sem colapsar para `real`. Fonte documental pode orientar implementação, nunca prova a operação do usuário. Relatório do modelo aponta evidência existente e suas limitações, não se autoautentica.

## 3 Estados e falhas

`CheckState` é exatamente C05, sem estado “sucesso” adicional. `WorkloadState` é independente. Repetir `validation.run` enquanto running apenas retorna o mesmo estado da execução vinculada; não lança nova coleta. Reexecução deliberada prepara nova validação, mantendo trilha do resultado anterior. A deduplicação de coleta obedece S07/Command, não cria dispatcher paralelo.

| Estado / condição | Próximo estado / resultado |
| --- | --- |
| Preparação válida | `not-run`; nenhum workload iniciado |
| `not-run` + ativação/Command autorizado e digest exato | `running`; coleta vinculada à preparação |
| `running` + dados tipados comparáveis + critério satisfeito | `passed`, limitado à afirmação/população preparadas |
| `running` + dados válidos refutam critério | `failed`, com contraprova limitada autorizada |
| Falta input, fonte falha, tipos incompatíveis, instrumento quebrado | `error` se tentativa ocorreu; preparação inválida é `Problem`, nunca `passed` |
| Skip, amostra insuficiente, snapshots incompatíveis | `inconclusive` se tentativa não decide; sem execução permanece `not-run` |
| Run não autorizado / digest/revisão divergente | `denied` / `conflict`, sem nova coleta nem alteração de evidência antiga |
| Job falha/cancela/unknown ou processo cai sem conclusão do check | `error` ou `inconclusive` conforme evidência; jamais herdar sucesso de job ou redisparar efeito |
| `validation.get` offline / payload ausente | Estado local permitido com idade ou `offline`/`unavailable`; zero consultas remotas implícitas |

Exigir prova positiva das precondições de `passed`; “nenhuma falha encontrada” em uma fonte indisponível não satisfaz o critério. Um erro de request não apaga estado terminal já registrado para outra revisão/run.

## 4 Persistência e autoridade

Registros no store de domínio Orchestra com isolamento C01, sem DB paralelo. Persistência com dados é opt-in por evidência, cifrada conforme C07/S13, prazo padrão Q03 de sete dias; sem proteção demonstrada, payload sensível fica apenas em memória. Não converter result handles em cache durável ou copiar rows/query para eventos/model history. Metadados mínimos de estado/proveniência obedecem classe/prazo definidos por S13; não se presume retenção eterna.
Consultar política atual antes de reexibir conteúdo salvo, mesmo cifrado, offline ou ainda dentro do prazo; revogação conhecida e contexto excluído impedem acesso pertinente. Offline pode mostrar material local cuja política autorize, com idade/limitação explícitas, sem executar nem enfileirar trabalho. Aprovação de mudança não concede egress ou acesso a dados. `validation.get` não cria Authority, Tool.Context, nova invocação ou licença de fonte; S09 conserva sua própria proveniência independente de chat.

## 5 Prova e bloqueios

Testes futuros nomeados, ainda não executados. O oráculo compara registros/queries/resultados reais da implementação; mocks/documentação não qualificam operação Fabric. Para cada instrumento, controle conhecido-bom deve passar e conhecido-ruim falhar; quebrar a coleta deve produzir erro/inconclusivo, não verde.

| ID / teste futuro | Asserção positiva | Asserção negativa |
| --- | --- | --- |
| FS-VAL-001 / `validation-prepare-binding` | Preparação conserva pergunta/critério/população/destinos e digest reproduzível | Mudar critério/identidade/snapshot após preparar rejeita run antigo sem coleta |
| FS-VAL-002 / `job-check-separation` | Readback correto registra a revisão observada enquanto check válido decide separadamente | 202, exit success e job succeeded não alteram `not-run` para `passed` |
| FS-VAL-003 / `instrument-good-bad-broken` | Dataset bom passa e defeito conhecido produz `failed` com mesma implementação | Fonte falha, skip, input ausente ou tipo incompatível nunca passam como zero violações |
| FS-VAL-004 / `snapshot-comparability` | Populações e watermarks compatíveis permitem reconciliação registrada | Mutação sem snapshot, filtro/período incompatível ou baseline ausente impede `passed` |
| FS-VAL-005 / `equal-count-different-content` | Critério de conteúdo com chaves/exclusões detecta alteração conhecida de valor | Mesma contagem com receita divergente não recebe equivalência semântica |
| FS-VAL-006 / `evidence-revision-policy` | Evidência guarda query real/meta/digest/critério e alcance parcial correto | Outra revisão/destino, retenção expirada ou revogação conhecida não reutiliza conteúdo/aprovação |
| FS-VAL-007 / `evidence-mode-separation` | Controle real qualificado e fixture aparecem rotulados separadamente | Misturar demo/documentação com real não produz recibo operacional nem claim real integral |

**B10-1 — decisão documental integrada pelo lead, prova de freeze ainda bloqueada:** C08 define refs, ambiente versionado, preparação e snapshot compartilhados. Materializar/compilar codecs de critério/população/evidência e vínculos S07/S08/S09; mostrar roundtrip, comparabilidade e imutabilidade no contrato real. Markdown e forma nominal de ref não são prova de integração.
**B10-2 — BLOCKER de qualificação:** registrar critérios efetivamente implementados, codecs/precisão/tolerâncias, garantias de snapshot por engine e prova independente dos controles bom/ruim/quebrado. Critério de negócio não fornecido impede seu check, não autoriza inferi-lo.
**B10-3 — BLOCKER de integração:** demonstrar persistência opt-in e proteção/retenção S13, reexibição autorizada, egress S11 e run via ativação/Command sem segunda execução/autorização. Qualificação Fabric requer ambiente/identidades autorizados ainda ausentes; CI determinístico não usa tenant/modelo hospedado.
RELAY armado, hook não verificado; nenhuma alegação de enforcement ou prova executada.
