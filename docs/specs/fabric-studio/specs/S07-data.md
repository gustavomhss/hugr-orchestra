# S07 — Ativação, consultas e resultados limitados

**Estado:** proposta técnica; não congelada para implementação.
**Requisitos proprietários:** FS-DAT-001–013; FS-PRV-005

## 1 Responsabilidade e integrações

Possui ativação de fontes, result handles, cache temporário, coordenação de leituras e semântica de gráficos/exportação de dados. Consome [CONTRACTS.md](CONTRACTS.md), C01–C07, sem redefinir identidade, autorização ou lifecycle de Command. [S06](S06-discovery.md) resolve referências; S03 qualifica engines/operações; S05 compõe UI; S09 observa jobs existentes; [S10](S10-validation.md) usa resultados para checks; S11 governa egress e S13 proteção/retenção.
Base: [requirements](../requirements/03-discovery-and-queries.md), [privacidade](../requirements/02-authority-and-data.md), Q03/Q04/Q06–Q09/Q12/Q13 e DESIGN §13. Os contratos não estão compilados nem qualificados em Fabric; escolher Tedious/Kusto/REST não demonstra compatibilidade Bun ou isolamento real.

## 2 Contrato

Usa `source.activate/pause/read` e `data.export.prepare/download` de C06. A autoridade é sempre a do boundary atual, nunca um campo do DTO. ActivationRef, ResultHandle e ExportRef são os refs opacos de C08 authoring-2, vinculados server-side ao contexto/política. A notação abaixo define entradas/saídas propostas do domínio, não endpoints ou schemas já publicados.

| Operação | Entrada proposta | Saída proposta |
| --- | --- | --- |
| `source.activate` | `{context: ContextRef, scope: ObservationScope, capability: CapabilityRef, mode: modo C03, args: parâmetros estritos da capacidade, budget: {timeoutMillis, pageRows, maxRows, maxBytes}, refresh: {enabled: boolean, intervalMillis?: inteiro positivo}, consent: intenção explícita limitada}` | `{activation: ActivationRef, mode: modo C03, expiresAt: instante, effectiveBudget: budget, refresh: configuração efetiva}` |
| `source.pause` | `{context: ContextRef, activation: ActivationRef}` | `{activation: ActivationRef, paused: true}`; preserva resultado autorizado, impede novos ciclos |
| `source.read` — executar | `{context: ContextRef, activation: ActivationRef, request: {kind: "execute", executionKey: string, args: parâmetros permitidos}}` | Envelope abaixo ou `Problem` |
| `source.read` — página | `{context: ContextRef, activation: ActivationRef, request: {kind: "page", result: ResultHandle, cursor?: string}}` | Envelope abaixo ou `Problem`; jamais inicia query nova |

Campos de budget são inteiros positivos seguros: timeout/intervalo em milissegundos, rows em unidades de linha e bytes em UTF-8 codificado; TTL/expiresAt é fixado pelo servidor dentro da política, seed de query até quinze minutos C08, nunca ilimitado. `dormant` não emite licença operacional; ativação de modo operacional exige consentimento/política já pertinentes, com origem confiável C04. `consent` não é booleano que autentica a si mesmo. Resume/alteração de recorrência passa novamente por `source.activate`, sem renovação por mount. Vincular `service-observation` exige JobRef/proveniência de S09 e só permite observar workload existente, sem query de dados ou novo efeito. Capacidade de query de item exige ObservationScope resource, não converte scope connection em licença de dados do tenant.

Envelope proposto: `{result: ResultHandle, schema: {columns: {name: string, typeID: ID de tipo registrado, nullable: boolean}[]}, rows: células tipadas[][], observation: ObservationMeta, filters: objeto estrito da fonte, argsDigest: string, nextCursor?: string, truncation: {rows: boolean, bytes: boolean, timeout: boolean}, problems: Problem[], freshness: {expiresAt: instante, revalidationRequired: boolean}, workload: WorkloadState, cancellation: Cancellation, cost: {transferredRows: inteiro não negativo, transferredBytes: inteiro não negativo, scannedBytes?: inteiro não negativo, scanKnown: boolean}}`.
Página é limitada pelo primeiro teto atingido; cada célula obedece ao typeID e comprimento de coluna, sem coerção silenciosa/perda numérica. Tipos, tamanho de schema/célula, precisão, nulos e codificação fazem parte de B07-1; não se usa `any`/HTML ativo. `complete` de ObservationMeta só é verdadeiro com obtenção completa sem erro/limite; ausência de `nextCursor` sozinha não prova completude. Erros parciais preservam dados autorizados, mas não viram sucesso integral.

### FS-DAT-001 — Licença de consumo não exportável

Servidor fixa owner/server/storageID, ContextRef/geração, ObservationScope (incluindo todos os campos de ResourceRef quando kind resource), identidade efetiva/RLS, capability/revision, argumentos ou conjunto permitido, permissionEpoch, exposição, TTL e budget. Renderer recebe ref, não bearer. Binding, seleção, foco, mount e layout não concedem nem ampliam licença. Seleção `null` suspende novos fetches dependentes e limpa resultado exibido; seleção diferente só lê se couber exatamente na ativação vigente.

### FS-DAT-002 — Leitura efetiva por engine

Antes de ativar, capacidade qualificada demonstra restrição real de leitura na identidade/engine. Prefixo `SELECT`, parser cosmético ou nome “query” não classifica segurança de SQL/KQL/DAX. Se o engine/identidade não puder impedir efeitos, negar query arbitrária e expor somente capacidade de leitura preparada cuja semântica tenha sido qualificada. Efeitos de management/execução usam Command de S09, não esta fonte. Sem fallback shell, credencial mais forte ou driver não escolhido em Q06.

### FS-DAT-003 — Envelope fiel

Validar schema/rows no servidor; manter contexto, instante, identidade e limites junto de cada página, inclusive primeira página parcial. Cursor de resultado é opaco, vinculado ao handle, owner/contexto/geração, conexão/identidade/destino, argumentos e permissionEpoch; não é URL nem licença. Confrontar handle com argsDigest/filtros originais e política atual. Tipagem incompatível não é convertida em célula vazia. Resposta tardia só entra se coincidir com contexto/geração, conexão/geração, identidade, destino e argumentos capturados pela UI; abortar o request não substitui essa comparação.

### FS-DAT-004 — Bounded materialization

Seeds Q09: timeout 60 s, página 1.000 rows, resultado interativo no máximo 10.000 rows ou 5 MiB (5 × 1.024 × 1.024 bytes), primeiro limite atingido. `maxBytes` mede envelope de dados serializado em UTF-8 acumulado, incluindo schema/rows, com limite de célula antes de alocar material descontrolado; qualificação deve verificar também o buffer do driver. Políticas mais restritivas vencem. Eventos/transcritos levam referências/status permitidos, nunca dataset; obter outra página não reexecuta a query.

### FS-DAT-005 — Chave de isolamento

Cache/dedup usam server, storageID, principal, Location resolvida, ContextRef/geração, conexão/geração, tenant/workspace/recurso, identidade efetiva e contexto RLS, capability/revision, argumentos/filtros canônicos, permissionEpoch e exposição. Hash só otimiza lookup; conferir vínculo canônico antes de servir. Mesmo SP, tabela ou query textual não autoriza compartilhamento entre operadores/identidades. Manifesto não fornece principal/Location como prova.

### FS-DAT-006 — Revalidação antes de reexibir

Antes de servir cache/handle/evidência, verificar política e invalidações conhecidas com identidade/destino atuais. Revogação detectada, desconexão ou retarget invalida material pertinente; excluir contexto invalida handles permanentemente. Metadados têm TTL seed de 60 s, nunca maior que exigência da operação. Expiração pode preservar indicador de idade, não conteúdo que exija reautorização. TTL não promete detectar instantaneamente toda revogação remota. Retenção S13 e evidência salva não são grants de exibição.

### FS-DAT-007 — Compartilhamento sem colapsar intenção

Leituras equivalentes e simultâneas na mesma chave/autoridade podem compartilhar fetch/observação e referências contadas. Remount/reordenação reutiliza a execução conhecida, sem renovar TTL. `executionKey` identifica pedido de query dentro da ativação: repetição exata reconcilia a execução temporária; argumentos divergentes geram `conflict`. Nova query deliberada usa chave nova. Perda do estado temporário não provoca retry cego de workload ambíguo; operações duráveis/efeitos continuam pertencendo a S09.

### FS-DAT-008 — Dono de consumo explícito

Ocultar/desmontar painel interrompe seus novos ciclos, salvo serviço de observação explicitamente ativo com dono/budget visíveis de S09. Encerrar último consumidor não inicia nova query nem transforma ativação em observação durável. Foco só reavalia freshness local. Suspender observação não afirma cancelar engine.

### FS-DAT-009 — Fila e backoff

Seeds por conexão: duas consultas e quatro reads de metadados em voo, até 32 pedidos em fila visível/cancelável C08. Admitir fila não reserva autoridade eterna: revalidar ao sair. Respeitar `Retry-After` e backoff do adaptador antes de novo ciclo permitido; não repetir query deliberada ambígua automaticamente. Nunca alternar identidades para contornar throttle. Budgets finais exigem medição B07-2; agregado de materialização segue tetos temporários C08, não só o limite de cada resultado.

### FS-DAT-010 — Custo não é tamanho de página

Medir rows/bytes transferidos separadamente de scan informado pelo engine. `scanKnown: false` não equivale a zero; não inferir preço, custo barato ou scan baixo de `LIMIT`/paginação. Exibir origem/unidade da métrica de scan quando suportada; adaptações sem métrica dizem desconhecido.

### FS-DAT-011 — Limites e cancelamento honesto

Timeout/limite interrompe admissão de páginas e materialização local, preservando erro/truncamento e estado remoto conhecido. Cancelamento usa `Cancellation` C05: `requested` só vira `confirmed` com prova suportada. Abortar request pode deixar `WorkloadState: unknown` ou workload ainda `running`; não virar `cancelled` por timeout. Cancelamento que exige efeito separado segue S09, sem ampliar licença de leitura.

### FS-DAT-012 — Recorrência controlável

Refresh é desligado por padrão; ativá-lo é intenção separada, intervalo seed mínimo 60 s e nunca inferior ao exigido pelo serviço. UI mostra ativo/pausado, próximo ciclo e motivo de espera; `source.pause` bloqueia novos ciclos mesmo com painel aberto, mantendo resultado e contexto autorizados. Retomar é deliberado sob política/TTL atuais; pause não renova ativação, cancela job nem esvazia o espaço. Sem polling oculto ao reconectar/reiniciar.

### FS-DAT-013 — Figura derivada identificável

Gráfico referencia ResultHandle, colunas tipadas e transformação semântica identificada: query já agregada ou regra registrada com entradas/pesos/população explícitos e adequada à unidade. Não criar agregação genérica de negócio para preencher componente. Sem pesos, média de percentuais não recebe rótulo de margem consolidada; oferecer tabela/limitação sem produzir valor fictício. Transformação não altera ObservationMeta nem promove resultado parcial a integral.

### FS-PRV-005 — Exportação explícita e separada

Exportar dados exige destino, formato, colunas/filtros/escopo, identidade, aviso de permanência e tetos próprios antes de habilitar. C06/C08 escolhem JSONL do recorte já capturado de ResultHandle, até 10.000 rows/5 MiB codificados, preview e ExportRef de uso único/seed 60 s. Download autenticado reautoriza e não requery; formato maior que o teto exige recorte menor, não truncamento silencioso. Não anunciar “resultado completo” de preview truncado. Workspace export/import de S12 carrega receita, não rows/handles/licenças. Exportação integral com query nova/CSV não é autorizada por este contrato. Revogar depois não recolhe cópia baixada. Implementação/qualificação permanecem bloqueadas até provar a fronteira/limites, não até outra decisão de formato.

## 3 Estados e falhas

Os modos são exatamente C03; `WorkloadState`, `Cancellation`, `Availability` e `Problem` são C02/C05, sem enums concorrentes.

| Origem / evento | Destino / efeito |
| --- | --- |
| `dormant` + mount/foco/binding | Continua dormante, sem chamada Microsoft |
| Consentimento válido compatível | `metadata-consented`, `query-activated` ou `service-observation`, nunca promoção implícita |
| Ativação + seleção null / pause | Suspende novos reads/ciclos; null limpa exibição, pause conserva último resultado permitido |
| Pause + retomada deliberada | Revalida via `source.activate`; expirado não se autorrenova |
| Ativação expira / troca destino/identidade | Recusa novo read com `expired`/`conflict`; invalida geração/material pertinente |
| Fila cheia / throttle | `limit` / `throttled`, espera visível e retry permitido pela política |
| Schema/célula inválida / query não segura | `invalid-input` ou falha da fonte / `denied` ou `unsupported`; não passa como rows vazias |
| Request interrompido sem prova remota | Estado remoto conhecido ou `unknown`, não sucesso/cancelamento inventado |
| Handle de outro owner / epoch obsoleto | `denied` / revalidação obrigatória; não expor payload |

## 4 Persistência e autoridade

Ativações/resultados/rows ficam no servidor e em memória temporária; Q03 determina limpeza ao encerrar sessão de dados/contexto ou após 30 minutos sem uso, primeiro evento, sob lifecycle de S13. Estado temporário perdido expira ref; não reconstruir execução a partir do layout. Disco sensível só após proteção C07 demonstrada. Evidência opt-in de S10/S13 é classe separada, não cache durável automático.
Requests/serviços usam autoridade existente C04 e rechecagem atual. Ref não exportável pode viajar entre componentes locais autorizados, não em receita, transcrito, log ou grant transferível. Conteúdo destinado ao modelo só passa por S11 antes de admissão em histórico; exibição local não consente egress. Nenhum resultado bruto é publicado em eventos novos por conveniência.

## 5 Prova e bloqueios

Asserts futuros, não executados; exercitar implementação e adaptadores qualificados, com controle conhecido bom/ruim, sem relato do modelo como oráculo.

| ID / teste futuro | Asserção positiva | Asserção negativa |
| --- | --- | --- |
| FS-DAT-001 / `activation-binding` | Consentimento exato permite read no escopo | Mount/foco/null/outro destino não chama query nem renova TTL |
| FS-DAT-002 / `engine-readonly-conformance` | Leitura preparada retorna controle conhecido na identidade real | Consulta de efeito sob disfarce SELECT não modifica engine; sem enforcement, arbitrária é negada |
| FS-DAT-003 / `result-envelope-race` | Página guarda schema/filtros/meta/erro parcial correspondentes | Resposta tardia e célula incompatível não entram como resultado válido completo |
| FS-DAT-004 / `result-bounds` | Abaixo/no limite devolve bytes/rows tipados contabilizados | Acima de cada teto interrompe/trunca nomeadamente, sem dataset em evento/histórico |
| FS-DAT-005 / `cache-authority-partition` | Mesma autoridade/tupla reutiliza resultado autorizado | Mesmo recurso sob outra RLS/contexto/global project não recebe rows antigas |
| FS-DAT-006 / `cache-revalidate` | Cache vigente passa pela política antes de exibir | Revogação conhecida/retarget/epoch novo impede reexibição apesar de TTL restante |
| FS-DAT-007 / `read-coalescing` | Dois consumidores compatíveis compartilham um fetch conhecido | Identidade diferente e duas execuções deliberadas não colapsam; chave conflitante falha |
| FS-DAT-008 / `hidden-consumer` | Job observado explicitamente mantém dono/budget fora do painel | Ocultar painel sem serviço não mantém polling nem inicia query |
| FS-DAT-009 / `connection-budget-backoff` | Controles ocupam duas/quatro vagas e mostram excedente em espera | Throttle/foco não atravessa Retry-After nem distribui carga entre identidades |
| FS-DAT-010 / `scan-vs-transfer` | Engine com métrica conhecida mostra scan e transferência separados | Mil rows ou scan ausente não vira custo zero/barato |
| FS-DAT-011 / `cancel-scope` | Confirmação real muda Cancellation e estado observado adequadamente | Abort/timeout local sem confirmação não marca engine cancelado/sucedido |
| FS-DAT-012 / `refresh-pause-open` | Com painel aberto, pause bloqueia próximo ciclo preservando contexto/resultado | Retomar sem ato deliberado/TTL válido não consulta; pausar não cancela job |
| FS-DAT-013 / `chart-semantic-transform` | Soma ponderada identificada coincide com query/controle calculado externo | Percentuais sem pesos não geram margem consolidada ou total inventado |
| FS-PRV-005 / `data-export-boundary` | Após qualificação, exportação obedece destino/rows/bytes consentidos e avisa permanência | Sem tetos/operação aprovada permanece desabilitada; receita não exporta rows nem promete recall |

**B07-1 — BLOCKER para freeze:** refs/ObservationScope foram consolidados pelo lead em C08; materializar/compilar schemas de parâmetros, tipos de célula, schema máximo, consentimento/recorrência e paginação em Schema/Protocol e gerar Client. Notação em Markdown não é essa prova.
**B07-2 — BLOCKER de qualificação:** demonstrar restrição real de leitura e cancelamento por engine/identidade; conformidade Bun de Q06; medir limites/células/buffers/fila e fixar budgets finais. Seeds são decisões de ensaio, não garantias de memória, latência ou consumo.
**B07-3 — decisão de integração resolvida pelo lead em authoring-2:** C06/C08 definem prepare/download, formato/destino/tetos/ref. Ainda falta provar reautorização, codificação limitada, uso único e erro/expiração sem vazar arquivo parcial antes de habilitar a feature.
Proteção/retenção S13, egress S11 e observação/Command S09 são dependências de freeze. RELAY armado, hook não verificado; nenhum enforcement nem teste Fabric é alegado.
