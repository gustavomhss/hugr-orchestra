# S06 — Descoberta incremental e dependências

**Estado:** proposta técnica; não congelada para implementação.
**Requisitos proprietários:** FS-DIS-001–006

## 1 Responsabilidade e integrações

Esta spec possui inventário, resolução de referências, observações de relações e cobertura. Consome [CONTRACTS.md](CONTRACTS.md), C01–C03/C06, e a divisão de [OWNERSHIP.md](OWNERSHIP.md); não concede acesso nem redefine contexto, catálogo ou ativação.
S02 resolve owner/store/Location/conexão; S03 qualifica a operação; [S07](S07-data.md) autoriza e limita leituras; S08 mantém o destino aprovado imutável; S13 governa retenção. Nenhuma listagem implica acesso administrativo, varredura de tenant, download de definições ou consulta a rows.
Base: [requirements](../requirements/03-discovery-and-queries.md), decisões Q03/Q04/Q06–Q09/Q12/Q13 e DESIGN §12. São contratos futuros, não capacidades de drivers ou stores existentes demonstradas.

## 2 Contrato

Notação estrutural proposta, readonly, campos opcionais omitidos. `ContextRef`, `ResourceRef`, `CapabilityRef`, `ObservationMeta`, `Problem`, `Availability`, ObservationScope e EnvironmentMapRef são exclusivamente os de C01/C02/C08 authoring-2. IDs não são grants. Somente as operações lógicas C06 abaixo são usadas; não se publica endpoint adicional.

| Operação | Entrada proposta | Saída proposta |
| --- | --- | --- |
| `resource.list` | `{context: ContextRef, scope: ObservationScope, filter: {resourceTypes?: string[], namePrefix?: string}, cursor?: string, budget: {maxPages: inteiro positivo, maxItems: inteiro positivo}}` | `{items: {resource: ResourceRef, label: string, availability: Availability}[], observation: ObservationMeta, nextCursor?: string, coverage: cobertura, problems: Problem[]}` |
| `resource.resolve` | `{context: ContextRef, resource: ResourceRef}` | `{resource: ResourceRef, label?: string, availability: Availability, observation: ObservationMeta}` ou `Problem` |
| `resource.observe` | `{context: ContextRef, resource: ResourceRef, capability: CapabilityRef, operation: ID de observação preparado, args: objeto estrito dessa operação, cursor?: string}` | `{resource: ResourceRef, edges: aresta[], observation: ObservationMeta, coverage: cobertura, nextCursor?: string, problems: Problem[]}` |

`scope`, filtro e budget são validados no servidor contra catálogo/política, antes de acesso remoto. Listagem de workspaces usa scope connection/tenant efetivos já resolvidos; itens usam scope workspace; observações de item usam scope resource. A capacidade deve aceitar o kind exato; não significa todo o tenant. O schema por operação limita strings, listas, páginas e tamanho codificado; limites finais são bloqueio B06-1. ObservationMeta.scope representa esse alcance real, sem ResourceRef sintético para preencher listagem raiz.

### FS-DIS-001 — Paginação scoped

Uma chamada percorre no máximo o budget autorizado, com continuidade explícita. Cursor opaco emitido pelo servidor referencia estado vinculado a owner, server/storageID, contexto/geração, conexão/geração, identidade efetiva, escopo, filtro canônico e permissionEpoch. Validade expirada ou vínculo diferente falha; cursor não escolhe conta nem é URL remota executável. Não iniciar a próxima página por montar painel; consentimento de metadados de S07 delimita o percurso. Falha total é `Problem`, não `items: []`; parcial inclui `problems` e `complete: false`.

### FS-DIS-002 — Identidade e resolução

Indexar por todos os campos de `ResourceRef` e contexto autorizado, nunca pelo label. Rename atualiza label sem trocar resourceID; exclusão/perda de acesso torna a referência indisponível, sem resolver homônimo automaticamente. Recursos desconhecidos podem exibir apenas metadados seguros e `Availability` pertinente, sem comportamento mutante genérico. Importação usa resolução S02, não adota connectionID do remetente como autoridade.

### FS-DIS-003 — Aresta verificável

`aresta = {from: ResourceRef, to?: ResourceRef, unresolvedLabel?: string, kind: EvidenceKind, relation: ID de relação registrada, observation: ObservationMeta, definitionDigest?: string, coverage: cobertura}`; exatamente um de `to`/`unresolvedLabel`. `EvidenceKind` vem de C02: `provider`, `extracted`, `inferred`, `user`, `unknown`. A classe é o grau de sustentação declarado, não probabilidade inventada. Extração exige parser/revisão suportados e digest da definição; inferência/declaração não muda de classe por aprovação humana. Sem revision do provedor, registrar a ausência e instante; não fabricar revision.

### FS-DIS-004 — Cobertura não é ausência global

`cobertura = {scope: descrição estruturada do escopo solicitado, state: "complete" | "partial" | "unknown", gaps: {scope: descrição estruturada, problem?: Problem, reason: "denied" | "unsupported" | "not-scanned" | "limit" | "unknown"}[]}`. Os schemas dessas descrições precisam ser fechados por operação em B06-1. `complete` significa apenas percurso conhecido concluído no escopo/instante, não completude do universo de consumidores. Remover uma aresta da visibilidade ou esvaziar uma página não prova sua inexistência. Falta de acesso externo permanece lacuna visível, sem expor identificadores proibidos.

### FS-DIS-005 — Idade e resposta tardia

Toda exibição usa observedAt, identidade, modo, complete e providerRevision quando disponível. Cache de metadados tem seed de 60 s, subordinado à política/revalidação mais forte de S07. A UI captura contexto/geração, conexão/geração, fingerprint de identidade, destino e digest dos argumentos; só aplica resposta que ainda corresponda a essa tupla e à seleção corrente. Abort local é otimização, não a proteção. Observação antiga não satisfaz preflight de uma nova mudança.

### FS-DIS-006 — Mapeamento de ambientes

Resolver ambiente pelo registro server-side S02/C08: EnvironmentMapRef, test/publish classificados pelo servidor e pares de itens explícitos. Mostrar os dois destinos e revisão do mapa antes de comparar/agir. Sufixo, label ou alias importado não é resolução. Mudança no mapa invalida resolução/preflight correntes, nunca reescreve o destino de revisão aprovada em S08. Compatibilidade de população/snapshot é prova adicional S10, não consequência do mapa.

## 3 Estados e falhas

| Condição / transição | Resultado obrigatório |
| --- | --- |
| Escopo válido + página vazia final | `items: []`, sem cursor, cobertura limitada ao escopo observado |
| Página válida com continuação | Preservar cursor/vínculos e `complete: false` até completar percurso |
| Budget atingido | Cobertura parcial, `Problem.code: limit`, continuidade apenas se suportada |
| Cursor expirado / de outro contexto | `expired` / `denied`; nenhum fetch por esse cursor |
| Mesmo owner, filtro/epoch/geração divergentes | `conflict`; reinício deliberado sob política atual |
| Provedor negou / throttle / rede caiu | `denied` / `throttled` com espera / `offline` ou `unavailable`; não vazio falso |
| Recurso removido ou invisível | Referência histórica sem conteúdo não autorizado; não alegar exclusão se só há negação |
| Troca de identidade/destino durante request | Invalidar geração, descartar resposta antiga, exigir resolução/ativação compatível |

`Availability` permanece C02; estados da tabela não criam novo enum público de readiness. Em erro parcial, itens já obtidos só são exibidos se ainda autorizados; não promover `complete` por ignorar páginas falhas.

## 4 Persistência e autoridade

Cursores, cache e observações são server-owned, isolados por C01 e chave de S07. Metadados sensíveis seguem S13; não há cache durável implícito nem gravação de definições por abrir inventário. Cursor pode ser estado opaco em memória; reinício o expira, não exige nova store paralela. Antes de reexibir qualquer observação, consultar política atual e invalidações conhecidas; TTL não promete revogação remota instantânea.
Todos os acessos entram pelo boundary autorizado existente; não há auth callback, grant ou invocação paralelos. Leitura de grafo exige capacidade/ativação adequadas ao custo de sua fonte; não extrair definições indiscriminadamente como fallback para falta de API. Preservar fatos históricos mínimos não concede acesso ao conteúdo remoto.

## 5 Prova e bloqueios

Cenários futuros não executados; os nomes abaixo identificam asserts da implementação futura, não uma segunda aceitação dos requirements.

| ID / teste futuro | Asserção positiva | Asserção negativa |
| --- | --- | --- |
| FS-DIS-001 / `inventory-cursor-scope` | Com duas páginas conhecidas, percorrer só a página/budget pedidos e devolver continuidade | Trocar owner/filtro/epoch no cursor não chama o provedor; erro não produz vazio completo |
| FS-DIS-002 / `resource-identity-rename` | Dois homônimos mantêm refs distintas; rename mantém alvo | Excluir um e criar homônimo não retargeta editor/ref histórica |
| FS-DIS-003 / `edge-provenance` | Fonte explícita e extraída guardam modo, instante e revisão/digest correspondentes | Aprovar inferência não produz aresta `provider`; sem parser não declarar `extracted` |
| FS-DIS-004 / `graph-coverage-control` | Consumidor conhecido dentro do escopo aparece com cobertura correta | Negar acesso ao consumidor/controlar página faltante produz lacuna, não “nenhuma dependência” |
| FS-DIS-005 / `observation-generation-race` | Resposta da tupla corrente atualiza painel com idade | Entregar resposta antiga após troca de identidade/destino/args não altera resultado nem preflight |
| FS-DIS-006 / `environment-mapping-revision` | Mapeamento autorizado resolve IDs de teste/produção mostrados | Sufixo `prod` ou revisão nova do mapa não modifica destino aprovado |

**B06-1 — BLOCKER antes do freeze:** Schema/HttpApi compiláveis para escopos/filtros/cobertura/relações e limites medidos por operação; qualificar inventário sem adminscan e extração por formato, sob allowlist S03/Q12.
**B06-2/B06-3 — decisões de integração resolvidas pelo lead em authoring-2:** ObservationMeta.scope é união fechada connection/workspace/resource; mapa de ambientes é registro versionado S02/C08, consumido sem retarget por S06/S08/S10. A representação foi escolhida, mas codecs/SQL/guards e testes ainda são bloqueios de freeze, não prova executada.
Qualificação real de identidades/escopos e conformidade de bibliotecas Q06 permanecem pendentes; nenhum cenário acima comprova acesso Fabric. RELAY armado, hook não verificado; nenhuma alegação de enforcement.
