# Seam de autoria — Fabric Studio

**Revisão: authoring-2. Estado: baseline de autoria, não freeze de implementação.** O lead definiu authoring-1 antes de distribuir documentos dependentes; authoring-2 resolve as questões retornadas pelos autores após seu encerramento. Alterações precisam ser aplicadas a todos os consumidores e registradas em WAVE/REVIEW. Os blocos abaixo são notação normativa proposta, não uma API publicada. A materialização parcial posterior de referências/observações C01/C02 em Schema está registrada em [FOUNDATION.md](./FOUNDATION.md); os demais contratos e Protocol continuam sem freeze.

O recorte posterior de declaração possui contrato wire `FabricWorkspace` e assinaturas puras `parse/admit/compile` em materialização, conforme [DELIVERY.md](./DELIVERY.md) e S04. Esse freeze limitado não fecha C06, não publica rotas e não estabelece autorização, ativação, persistência ou qualificação operacional.

## C01 — propriedade e placement

Contexto Studio é criado/resolvido no servidor, pertence a `(server, storageID, principal, contextID)` e referencia uma Location real. `storageID` é o namespace do Database existente, não caminho dado por manifesto; quando o serviço não o fornecer, o host deve fornecer um identificador estável antes de ativar persistência. Contas/conexões e recursos Fabric são outro eixo. Autoridade vem do request/invocação atual, nunca do JSON recebido.

```ts
type ContextRef = Readonly<{ id: string; generation: number }>
type ResourceRef = Readonly<{
  connectionID: string
  connectionGeneration: number
  tenantID: string
  workspaceID: string
  resourceType: string
  resourceID: string
}>
type CapabilityRef = Readonly<{ id: string; revision: string }>
type WorkspaceRef = Readonly<{ id: string; revision: number }>
```

IDs acima são opacos, qualificados por domínio e validados na futura Schema; não se admite string arbitrária como prova. Gerações e revisões declaradas numéricas são inteiros positivos seguros. CapabilityRef e revisão de componente usam identificadores de revisão em string, não vazios, validados contra a entrada exata do catálogo e sem coerção para número; enums documentados são fechados. Os nomes de namespaces públicos serão `FabricContext`, `FabricResource`, `FabricWorkspace`, `FabricCommand`, não `V2` nem marcas/IDs duplicados. Campos opcionais wire são omitidos, não `undefined` codificado. IDs portáteis de recurso são sugestões sanitizadas rebindáveis; não importam connection ID, contexto, path ou principal do remetente como autoridade.

S02 possui ContextRef/ResourceRef e a resolução contextual; S04 possui WorkspaceRef/documento; S03 possui CapabilityRef. S08 possui revisão de mudança e S09 command/job. Nenhuma spec pode reutilizar `Location.workspaceID` como workspace Fabric. A UI recebe ContextRef e metadados permitidos, não principal/bearer para autenticar a si mesma.

## C02 — resultado, proveniência e disponibilidade

```ts
type Availability =
  | "disabled" | "not-installed" | "authentication-required" | "denied"
  | "unsupported" | "unverified" | "ready" | "degraded"
type EvidenceKind = "provider" | "extracted" | "inferred" | "user" | "unknown"
type EvidenceMode = "real" | "fixture" | "demo" | "documentation"
type ObservationScope =
  | Readonly<{ kind: "resource"; resource: ResourceRef }>
  | Readonly<{
      kind: "workspace"; connectionID: string; connectionGeneration: number
      tenantID: string; workspaceID: string
    }>
  | Readonly<{
      kind: "connection"; connectionID: string; connectionGeneration: number; tenantID: string
    }>
type ObservationMeta = Readonly<{
  context: ContextRef
  scope: ObservationScope
  capability: CapabilityRef
  identityFingerprint: string
  permissionEpoch: number
  observedAt: number
  complete: boolean
  mode: EvidenceMode
  providerRevision?: string
}>
type Problem = Readonly<{
  code: "invalid-input" | "conflict" | "denied" | "authentication-required"
    | "unsupported" | "unverified" | "limit" | "throttled" | "offline"
    | "expired" | "unknown" | "incompatible-version" | "unavailable"
  retry: "never" | "read-after" | "deliberate-action" | "reconcile"
  messageKey: string
  retryAfterMillis?: number
}>
```

Epoch é versão local conhecida da política/permissão; não prova conhecimento instantâneo de revogação remota. Um envelope de dados inclui schema, handles/páginas, truncamento e erros parciais, não dataset em evento ou transcrito. Falha não vira array vazio. `ready` exige prova da operação/contexto e é reavaliável, não grant. `mode` nunca é promovido de fixture/demo para real. Metadados também seguem política de dados.

Listagem de workspaces tem scope connection com tenant efetivo já resolvido; listagem de itens tem scope workspace; observação de item/query tem scope resource. Não inventar ResourceRef de tenant para preencher metadado. A capacidade determina quais scopes aceita; alterar kind não amplia escopo/consentimento. S02 valida conexão/tenant; S06 possui a cobertura da listagem.

Problemas são traduzidos para os erros HttpApi pertinentes, sem codificar respostas de sucesso falsas. HTTP 401/403/409/413/429/503 são transportes possíveis, não semântica exclusiva; um job remoto falho não significa erro de autenticação do request. Interrupções/defeitos não são normalizados silenciosamente para erro de domínio esperado.

## C03 — composição, seleção e ativação

Documento `fabric-studio.workspace`, `version: 1`, possui `title`, recipe/layout conhecido, aliases de contexto/recursos, ferramentas com IDs estáveis, component ID/revision, props estritas, source conhecida e bindings entre portas tipadas. Canais proibidos incluem JS, CSS livre, HTML, imports, shell, URLs livres, tokens/grants e expressões genéricas. Server valida autoritativamente; frontend usa o mesmo contrato para preview.

Portas v1: `ResourceRef?`, `ExecutionRef?`, `ResourceSet`, `ResultHandle?`, `FilterSet` (schema de filtros por fonte). Projeções permitidas são IDs de funções puras registradas; inicialmente `executionResource`. Todas preservam contexto/identidade/cardinalidade/nulabilidade/revisão. Ciclos são rejeitados. Fontes não são comandos e binding não é event bus.

Recipe v1: `explore`, `investigate`, `develop`, `change`, `compare`. Cada uma possui slots `main`, `support`, `inspect`; ausência de ferramenta em slot opcional não cria placeholder operacional. Ordem/abas/tamanhos/pins duráveis pertencem à revisão salva; seleção/foco/scroll/loading pertencem à instância. Normalização fica inspecionável. Alterar recipe/reordenar não altera ID da ferramenta nem estado de recurso editado.

Ativação de fonte é handle **server-side não exportável**, distinto de binding: `dormant`, `metadata-consented`, `query-activated`, `service-observation`. Handle vincula owner/context generation, conexão/destino/identidade, operação/argumentos ou conjunto permitido, policy epoch, exposição, TTL e budget. Um manifesto não transporta esse handle como licença. Seleção compatível só usa ativação vigente; seleção vazia suspende fonte dependente e limpa resultados; conta/destino diferente invalida geração, respostas tardias e caches pertinentes. Nenhum mount/foco/layout expande ou renova licença.

S04 define documento/compilação; S05 instancia componentes Solid com store/IDs estáveis; S06 resolve referência; S07 é o único dono de ativação e result handles. A spec de compositor não pode criar consulta por efeito reativo fora desse contrato.

## C04 — origem, mudança e consentimento exato

Origem é runtime confiável: `operator` com Authority atual do boundary Server, ou `agent` com invocação real e serviços da Location capturados pela leaf. O cliente pode indicar intenção, não escolher quem o autentica. Ferramentas são valores canônicos `Tool.make`, registradas por `Tools.Service` na Location pelo composition root. Registry/catalog filtering não autorizam execução. Não criar segundo executor, auth callback no registry, sessão fictícia ou loop de modelo.

Preparar uma ChangeRevision fixa: IDs de mudança/revisão, objetivo/esclarecimentos, recursos/identidades, conteúdo exato e refs/hash, parâmetros, ordem/DAG, baseline/proteção remota, efeitos/riscos, budget e ValidationRefs/recuperação por etapa. `revisionDigest = SHA-256(JCS(documento canônico completo))`; JCS é canonicalização JSON RFC 8785 com rejeição de valores não representáveis, sem omitir campos relevantes para o efeito. Hash de bytes executáveis é adicional ao digest do plano. Não recalcular conteúdo pelo modelo após consentimento.

Aprovação é registro de decisão humana nos controles confiáveis do app: revisionDigest, atores proponente/aprovador/executor permitido, destinos/identidades, efeitos, policy/context/connection generations, validade e decisão. Não contém Authority, token ou código remoto mutável. Aprovar não sobrepõe deny. Sandbox é vínculo server-side explícito; proteção fraca jamais autoriza produção/prod-like. Destruição/grants continuam high-risk e destruição irreversível fica fora do lançamento inicial.

## C05 — comando, tentativa e observação

```ts
type DispatchState = "intent" | "blocked" | "submitting" | "accepted" | "unknown" | "not-sent"
type WorkloadState = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "unknown" | "unavailable"
type Cancellation = "none" | "requested" | "confirmed" | "unsupported"
type CheckState = "not-run" | "running" | "passed" | "failed" | "inconclusive" | "error"
```

Command ID/passo emitido pelo servidor é a identidade estável entre abas/invocações. Admitir exige delivery key scoped e payload hash; repetição exata não cria efeito novo. Claim SQL compara `intent/blocked + expected generation` e persiste `submitting` antes de tocar a rede. Um claim já obtido não expira para outro dispatcher. Nenhum timeout local ou lease permite reenviar trabalho ambíguo. Se o processo cai após claim, `unknown`, mesmo que talvez nada tenha sido enviado; apenas evidência suficiente reconcilia. Repetir deliberate workload não é retry de transporte.

Após reboot: apenas observação de trabalho remoto existente, com autenticação/política atuais e provenance guard; novos efeitos requerem ação explícita e nova invocação/autoridade válida. Recibo/operação LRO/job/validation são registros e estados separados. `accepted`/202 não é job concluído; job `succeeded` não é check `passed`. Cancelar observação é local; pedir cancelamento é outro comando; `confirmed` exige evidência do provedor. Planos nunca convertem partial/unknown em sucesso global.

A proveniência mínima Studio não tem cascade com sessão/mensagem: fato de autoria capturado no boundary, vínculo à revisão/comando/contexto e remote IDs. Não recria Tool.Context; não adota legado sem prova. Apagar chat marca referência removida; observação separada do operador atual é leitura autorizada, sem direito de novo efeito. Apagar a proveniência necessária torna observação unavailable. Tombstone protege replay até exclusão do contexto, que invalida handles antigos permanentemente.

## C06 — operações de domínio e transporte propostos

Prefixo futuro `/api/fabric`; nenhuma rota existe por este documento. Todas as operações que recebem `contextID` resolvem owner/store/Location no servidor. IDs de objetos abaixo não são capacidades bearer. Rotas e DTOs finais precisam de Schema/HttpApi compiláveis e Client regenerado antes de freeze de implementação.

| Operação lógica | Entrada mínima | Saída / aplicação |
| --- | --- | --- |
| `context.create/get/list` | Intenção do operador e vínculo de projeto opcional resolvido pelo host | ContextRef + placement público permitido; nunca path arbitrário do manifesto. S02. |
| `connection.begin/complete/disconnect` | ContextRef, perfil de implantação; callback validado no servidor | Referência/status e identidade permitida, sem tokens. S02. |
| `capability.list` | ContextRef, recursos resolvidos | Readiness por CapabilityRef e motivo, sem grant. S03. |
| `resource.list/resolve/observe` | ContextRef, escopo/cursor/operação conhecida | Páginas/observações/arestas com proveniência. S06. |
| `workspace.validate/save/get/patch` | ContextRef, documento + expectedRevision quando aplicável | Diagnósticos ou nova WorkspaceRef; zero efeito Fabric. S04/S12. |
| `source.activate/pause/read` | ContextRef, capability/ObservationScope, parâmetros tipados e budget/consentimento | ActivationRef e ResultHandle/página; não ampliáveis por UI. S07. |
| `change.prepare/get/revise/approve` | ContextRef, objetivo/conteúdo/revisão exatos | ChangeRevision/ApprovalRef, não execução. S08. |
| `command.admit/submit/get` | ContextRef, change/step/approval refs, delivery key e origem runtime | CommandRef/recibo idempotente; submit tem efeitos sob política atual. S09. |
| `job.observe/stop-observation/request-cancel` | ContextRef, CommandRef/JobRef e geração; cancel com consentimento aplicável | JobObservation / comando de cancelamento separado. S09. |
| `validation.prepare/run/get` | ContextRef, critério e scope/baseline/result refs autorizados | ValidationRef/CheckState/evidência limitada. S10. Run usa ativação ou comando se houver efeito. |
| `workspace.export/import` | ContextRef, receita sanitizada e resolução no destinatário | Pacote de composição/revisão nova, não dados ou grants. S12. |
| `data.export.prepare/download` | ContextRef, ResultHandle, recorte exato e formato inicial JSONL | Preview/ExportRef e download autenticado das rows capturadas, sem requery ou destino URL/path arbitrário. S07/C08. |
| `retention.inspect/delete` | ContextRef, classes/IDs e confirmação de perda de prova | Recibo de exclusão local, sem efeito remoto. S13. |

GET local de observação/handle nunca inicia novo workload Microsoft. Consulta que consome engine exige ativação explícita e chave própria; erro não desencadeia query de novo. Eventos públicos novos não são assumidos: primeiro ciclo pode ler estado local autoritativo paginado; uma subscription futura só se publica se o consumidor atual exigir, com uma única definição canônica e sem payload de dados. Poll local não multiplica polling Microsoft: um serviço contextual mantém cada observação dentro do budget.

## C07 — proteção e publicação

Persistência usa Database/migrações existentes. Payload sensível só em envelope cifrado após guard de owner/contexto; conteúdo interno autenticado liga `domain`, `storageID`, `principal`, `contextID`, `recordID`, `kind`, `revision` ao payload. Após decrypt, comparar ao destino esperado antes de usar; troca entre linhas/contextos falha. Reusar primitivas/key lifecycle, não implementar cifra caseira nem chamar credencial de banco inteiro cifrado. Métodos e ensaio de replay/substituição são bloqueio de freeze de S13.

**Fatia de implementação PR01:** a seam `FabricRecords.make/get/put/remove`, schema `FabricRecord` e tabela `fabric_record.sealed` são delimitadas em [PROTECTED-RECORD-WAVE](PROTECTED-RECORD-WAVE.md). O envelope acrescenta `version` e `contextGeneration`; CAS/tombstone são locais, não idempotência de comando nem anti-rollback de backup. Recuperação usa o par já reservado na cifra existente, exposta pelo entry Credential sem criar cifra/registro de credencial novo. Testes e contraprovas medidos constam em DELIVERY; consumidores sensíveis e S13 completo continuam bloqueados pelos gates restantes.

S13 aplica retenções de Q03; S11 aplica egress **antes** de admissão em transcrito/prompt. Approval não é permissão de egress. Result handles locais são separados da evidência opt-in; exportação de dados não viaja dentro da receita de workspace.

Seams ainda sem prova: extensão genérica de cache opaco da credencial/Integration; instalação Location de ferramentas pelo composition root; transação/claim persistente; proteção do envelope; operação SQL remota de concorrência forte; limites medidos. Autores devem apontar esses bloqueios, não chamá-los implementados ou substituir por contrato fraco.

## C08 — integração decidida pelo lead após os rascunhos

Estes são os únicos refs compartilhados adicionais; nenhum é bearer. Estado e owner permanecem server-side, com comparação obrigatória ao ContextRef/política atuais. Ref expirada não recria trabalho.

```ts
type ActivationRef = Readonly<{ id: string; generation: number }>
type ResultHandle = Readonly<{ id: string; generation: number }>
type CommandRef = Readonly<{ id: string; generation: number }>
type JobRef = Readonly<{ id: string; generation: number }>
type ValidationRef = Readonly<{ id: string; revision: number }>
type ExportRef = Readonly<{ id: string; generation: number }>
type ExecutionRef = Readonly<{ job: JobRef; resource: ResourceRef }>
type EnvironmentMapRef = Readonly<{ id: string; revision: number }>
```

Referências são qualificadas por namespace na Schema futura; mesma forma `{id,generation}` não as torna intercambiáveis. JobRef de observação externa só é emitida após leitura autorizada do ID remoto sob recurso/contexto específicos; não fabrica command ou prova de produtor legado e não concede cancel/reexecução. FilterSet é array limitado de `{field, operator, value?}` sob schema da fonte; operadores iniciais `eq/in/gte/lte/is-null`, valores tipados e field permitido. Filtro nunca contém SQL/JS/JSONPath livre.

**Ambientes.** S02 possui binding e classificação server-side; S06 resolve e S08/S10 consomem o mapa. Registro versionado por contexto: EnvironmentMapRef, `test` e `publish` com connection ID/generation, tenant/workspace IDs e classification server-side (`sandbox/production/prod-like`), mais pares explícitos `{source: ResourceRef, target: ResourceRef}` quando houver mapeamento de itens. Revisão do mapa e referências efetivas entram no digest de mudança/validação; a nova revisão invalida preflight/approval antigos, não retargeta bytes aprovados. Mapas não são portados como classificação/grant. Comparabilidade de dados exige população/snapshot demonstrados, não só par de ambientes resolvido.

**Resultados e validação.** S07 possui schema de página e handles; S10 possui critério/evidência. ValidationRef identifica preparação imutável: statement, criterion `{id,revision,params}`, resources, EnvironmentMapRef quando pertinente, identidade esperada, população/filtros/período/fuso/amostra, baseline, snapshots, workRevision/contentDigest e limites. Snapshot por fonte declara ResourceRef, identityFingerprint, filterDigest, observedAt, unidade/granularidade quando aplicáveis e garantia `same-snapshot/stable-version/watermark/observed-time-only`, com versão/watermark quando disponível. Garantia observada-tempo apenas não é snapshot consistente. Ausência é explícita; critério decide se a comparação é admissível e, sem garantia suficiente, inconclusive.

**Pacote portátil.** C06 workspace.export/import usa um envelope único `format: fabric-studio.workspace-package`, `version: 1`, `workspace` (documento canônico S04), `origin?` `{templateID,templateRevision}`, `requiredVersions` (formato e pares id/revision de componentes/capacidades), `resourceHints?` por alias com tipo/IDs remotos somente se escolhidos e sanitizados, e `exclusions` fechado. Exclusions sempre declara credentials, authority, activations, results, approvals, remote-data e environment. Não transportar connection/context/principal/storage/path como grant. Primeiro ciclo não inclui assets/binários/definições de recursos ou buffers do editor embutidos: exportar esses dados/definições é outro contrato deliberado, não payload implícito da receita. Preview informa os campos removidos sem ecoar seus valores sensíveis. Import rejeita campo desconhecido/proibido e resolve aliases/owner/Location de novo. Seed: pacote até 512 KiB UTF-8, documento interno até 256 KiB e até 64 hints tipados; excesso rejeitado antes de parse ilimitado, sem truncar/exportar pacote inválido.

**Exportação de dados inicial.** JSONL sobre recorte já capturado de ResultHandle, colunas explicitamente escolhidas e rows conhecidas, teto seed 10.000 rows/5 MiB codificados, menor política prevalecendo. Não é “dataset completo” se o result veio truncado. Não faz nova query, não aceita URL/path de saída e não inclui evidência/credenciais. `prepare` produz ExportRef de uso único, preview de escopo/bytes/motivo de truncamento e prazo seed 60 s; `download` reautoriza contexto/identidade/política, serve somente conteúdo fixado, marca consumido e usa resposta autenticada no-store. Expiração/erro antes de servir é Problem, não arquivo parcial anunciado completo. Se codificação ultrapassa teto, exigir recorte menor; nunca truncar silenciosamente. Formato CSV e exportação integral que requery não estão implicitamente habilitados.

**Seeds adicionais para ensaio, não budgets medidos.** Ativação query até 15 minutos por decisão explícita (podendo ser menor por política), sem renovação por seleção/mount; fila até 32 pedidos por conexão, com cancelamento local e revalidação ao sair; resultados transitórios até 32 MiB/contexto e 128 MiB/instância; payload durável até 256 MiB/contexto e 1 GiB/instância, até 10.000 recibos e 100.000 tombstones/contexto. Sob pressão, expirar apenas caches/handles inativos elegíveis, com motivo; não descartar buffer dirty/seleção ativa/recibo/tombstone para admitir efeito novo. Se não houver espaço elegível, bloquear admissão correspondente com limit e explicar limpeza. Recibos/tombstones alcançados bloqueiam novas ocorrências, sem enfraquecer dedup. Observação de job já aceito conserva o mínimo de estado necessário; não depende de aceitar payload novo ilimitado. Logs técnicos persistentes ficam desligados inicialmente; diagnóstico opt-in seed 1 MiB, sanitizado e sem payload. Esses números precisam de medição antes de freeze de budgets finais, como Q09 exige.

Todas as formas acima ainda precisam de codecs/SQL/HttpApi compiláveis e provas de integração/limite; fechar uma escolha documental não fornece essas provas. O rollout de integração Core e o fence contra restore de S09/S13 continuam bloqueios de freeze independentes.
