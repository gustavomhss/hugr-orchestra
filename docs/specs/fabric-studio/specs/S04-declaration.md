# S04 — Declaração e compilação de espaços

**Estado:** proposta técnica; não congelada para implementação.

**Recorte em materialização:** a rodada DEC/PAR/CMP em [DELIVERY.md](./DELIVERY.md) congela somente o contrato wire e as funções puras de admissão/compilação, não o renderer, propagação de seleção, persistência ou API. O wire aceita revisões positivas seguras do layout; o compilador inicial suporta revisão 1 das cinco receitas e diagnostica as demais como `incompatible-version`.
**Requisitos proprietários:** FS-DEC-001–015

## 1 Responsabilidade e integrações

S04 possui o documento e sua compilação, não execução Fabric. Consome [CONTRACTS.md](./CONTRACTS.md), revisão `authoring-2`, C01–C03/C06/C08; S02 resolve contexto, S03 capacidades, S06 recursos, S07 ativação/resultados, S05 instâncias Solid e S12 portabilidade. A aceitação e a contraprova canônicas permanecem em [01-experience.md](../requirements/01-experience.md); as provas abaixo operacionalizam essas linhas, sem outro DoD.

Contrato serializável futuro em Schema, HttpApi em Protocol, validação autoritativa no domínio `modules/fabric` composto pelo Server e preview no app-shell usando o mesmo schema. Client não importa Core/Server; registry de componentes Solid é código confiável do app-shell, não um registry de ferramentas/autorização paralelo. Esta spec não publica rotas nem afirma que o compilador existe.

## 2 Contrato

### 2.1 Documento v1 e metadados internos

Forma wire proposta; os IDs `fabric.*` deste exemplo são ilustrativos, não entradas qualificadas ou endpoints existentes:

```json
{
  "format": "fabric-studio.workspace", "version": 1, "title": "Investigar carga",
  "context": {"resourceAliases": ["carga"]},
  "layout": {"recipe": "investigate", "revision": 1, "overrides": {}},
  "tools": [
    {"id": "runs", "component": {"id": "fabric.run-list", "revision": "1"}, "slot": "main", "props": {}, "source": {"capability": {"id": "fabric.execution.list", "revision": "1"}, "resourceAlias": "carga"}},
    {"id": "logs", "component": {"id": "fabric.run-log", "revision": "1"}, "slot": "support", "props": {}, "source": {"capability": {"id": "fabric.execution.logs", "revision": "1"}}},
    {"id": "details", "component": {"id": "fabric.resource-inspector", "revision": "1"}, "slot": "inspect", "props": {}}
  ],
  "bindings": [
    {"from": {"tool": "runs", "port": "selectedExecution"}, "to": {"tool": "logs", "port": "execution"}},
    {"from": {"tool": "runs", "port": "selectedExecution"}, "to": {"tool": "details", "port": "resource"}, "projection": "executionResource"}
  ]
}
```

`context.resourceAliases` declara nomes locais únicos a resolver, não `ContextRef`, credencial ou path. O request carrega o `ContextRef` de C01; resolução dessas aliases pertence a S02/S06. Recurso fixado usa alias declarado, não cópia parcial de `ResourceRef`. `WorkspaceRef` é exclusivamente `{id, revision}` de C01, retornado ao salvar; não se mistura à versão do formato. Component revision e CapabilityRef são independentes da revisão inteira positiva do layout e da revisão salva.

`layout.overrides` admite somente `order` (IDs únicos por slot), `activeTab` (ID existente por slot), `sizes` (pesos inteiros positivos por slot), `collapsed` (slots), `toolPins` (IDs), `resourcePins` (tool ID → alias) e `locked` (boolean). Todos os campos são opcionais; omissão significa default explícito na declaração efetiva. Só existem `main`, `support`, `inspect`; ordem deve respeitar o slot da ferramenta, sem IDs ausentes/repetidos. Pesos não são coordenadas/CSS e são normalizados deterministicamente; `main` tem uma ferramenta ativa e as demais podem ser abas. Slots opcionais vazios não criam ferramenta fictícia.

No recorte puro revision 1, pesos explícitos positivos seguros são preservados sem redução por divisor; somente ausentes recebem `main: 3`, `support: 2`, `inspect: 1`. Ordem parcial recebe as ferramentas omitidas do mesmo slot na ordem declarada. Aba ativa ausente usa a primeira ferramenta na ordem efetiva; qualquer slot vazio, inclusive `main`, não ganha aba fictícia. Normalizações contêm exatamente o caminho alterado, `before` quando existia, `after` e `messageKey: fabric.declaration.default`. A ordenação do DAG por Kahn escolhe o menor índice declarado entre as ferramentas prontas em cada passo, incluindo as recém-liberadas.

Metadados internos por component ID/revision: schema estrito de props, slots aceitos, mínimos de layout por token, portas de entrada/saída, schemas de fonte/resultado, ações conhecidas, estados suportados e lazy loader Solid. Funções/constructors ficam só nesse código confiável, nunca no wire. Source usa CapabilityRef conhecida e argumentos do schema dessa fonte; não admite operação de comando. Ação visível resolve intenção nos boundaries de S08/S09, nunca função serializada. Só S07 fornece `ResultHandle`; não se define dataset ou handle alternativo.

### 2.2 Regras de compilação por requisito

| ID | Contrato específico |
| --- | --- |
| FS-DEC-001 | Component ID/revision resolve exclusivamente lazy loader Solid confiável; duas declarações seguem o mesmo compilador, sem componente por template. |
| FS-DEC-002 | Template, importação, editor visual/avançado e IA entram por parse → schema → semântica → resolução autorizada → recipe → preview; origem não escolhe validação. |
| FS-DEC-003 | Objetos são fechados em cada nível. Rejeitar JS/HTML/CSS/import/shell/URL livre/grant/segredo; strings de conteúdo são texto escapado, não instruções ou ações. Props de código local só em componente confiável de edição, nunca executadas pelo documento. |
| FS-DEC-004 | Validar/normalizar/salvar/migrar não chama source.activate, command.admit/submit ou workload; leitura de metadados só usa disponibilidade já autorizada, sem probes custosos. |
| FS-DEC-005 | ID ou revisão de componente/ação desconhecidos gera diagnóstico no caminho exato e impede montagem; não há renderer/HTTP genérico de fallback. |
| FS-DEC-006 | Cada porta de entrada tem no máximo um binding escritor. Só portas ligadas recebem seleção; fonte dependente usa exclusivamente o argumento dessa porta, sem seleção global ou expressão paralela. Compatibilidade verifica domínio/identidade, tipo, cardinalidade, nulabilidade e revisão. |
| FS-DEC-007 | Projeção inicial única `executionResource`, pura e registrada, preserva ResourceRef/contexto; null permanece null. Ordenação topológica visita todas as ferramentas; autorreferência ou ciclo rejeita o grafo inteiro. |
| FS-DEC-008 | null invalida resultado e geração de leitura antes de suspender dependentes; interrompe refresh/fetch dependente, descarta resposta tardia e mostra seleção necessária. A→B também invalida A, mesmo com resourceID igual. |
| FS-DEC-009 | Propagação entrega referência, não ActivationRef. S07 confere escopo/argumentos/TTL/budget/policy atuais; fora do permitido permanece bloqueado até ativação deliberada. |
| FS-DEC-010 | Recipes fechadas `explore/investigate/develop/change/compare`; defaults usam revisão da recipe, catálogo e ordem declarada. Contexto/versões/janela iguais produzem organização efetiva igual; nenhuma escolha aleatória. |
| FS-DEC-011 | `workspace.patch` recebe ContextRef, WorkspaceRef base e documento candidato completo após edição. Diff por tool ID explicita adição/remoção/props/bindings/layout; aceite usa CAS da revisão base, rejeição não altera salvo. |
| FS-DEC-012 | Versão incompatível preserva bytes originais para inspeção/exportação e recusa escrita operacional. Migração explícita mostra diff, valida candidato e salva nova revisão por CAS, sem remapear IDs por aproximação. |
| FS-DEC-013 | Disponibilidade C02 de capacidade conhecida é metadado distinto de validade. Documento válido pode mostrar painel bloqueado com motivo e manter os demais; erro estrutural/semântico impede toda montagem. |
| FS-DEC-014 | Antes do preview executável, cruzar schema de props, slots, fonte/argumentos, resultado e portas com metadados da mesma revisão. ID conhecido com schema incompatível é inválido, não degraded. |
| FS-DEC-015 | Edição visual produz o mesmo documento que a avançada; normalização apresenta caminho/antes/depois/motivo. Preview, inspeção e exportação distinguem autoria original da declaração efetiva, sem defaults ocultos. |

### 2.3 Parse, limites e admissibilidade

JSON é canônico; YAML é conveniência convertida para esse modelo, sem tags customizadas, constructors ou aliases expansivos; v1 rejeita anchors/aliases YAML e chaves duplicadas em ambos. Rejeitar números não finitos/não representáveis e campos desconhecidos, sem coerção de tipos ou eliminação silenciosa. Não interpolar variáveis, executar expressões ou buscar includes externos.

Seeds de Q09: no máximo 262.144 bytes UTF-8 no input e no JSON efetivo codificado, profundidade 16, 24 ferramentas, 64 bindings. Raiz conta nível 1; cada objeto/array descendente acrescenta 1, scalar não acrescenta. Contagens incidem sobre arrays completos, inclusive ferramentas em abas/recolhidas. Excesso falha antes de montar/salvar; políticas menores prevalecem. Defaults não podem ultrapassar esses limites. São limites iniciais de ensaio, não SLOs ou budgets medidos.

O compilador não executa callbacks recebidos no documento. Diagnóstico de preview contém caminho JSON Pointer, código de problema C02 e chave i18n; valores sensíveis não são ecoados. Múltiplos diagnósticos são limitados pelo input aceito; erro não apaga o texto de autoria.

## 3 Estados e falhas

Transição local: autoria → parse/schema → semântica → preview válido ou autoria inválida preservada. Documento válido passa à resolução autorizada de aliases e disponibilidade por ferramenta; alias ambígua pede escolha, sem inferir por nome. `ready/degraded/denied/unverified` não tornam um documento inválido válido. Sem evidência de disponibilidade, usar `unverified`, nunca pronto.

Preview válido → proposta contra base → aceitar → CAS → nova WorkspaceRef; revisão concorrente retorna `conflict`, conserva base/local/proposta e exige reconciliar. Rejeitar permanece na base. Versão incompatível permite apenas inspeção/exportação segura até migração aceita. Normalização nunca concede acesso nem aceita uma operação nova.

Seleção propaga pelo DAG em ordem determinística. O consumidor só aceita resultado compatível com o snapshot completo de leitura de S07: ContextRef, todos os campos de ResourceRef/CapabilityRef, identidade, permissionEpoch, schema/fonte, argumentos normalizados e geração local da solicitação. Reordenar não muda esse snapshot; mudança de contexto, conexão ou argumentos invalida-o. Cancelar transporte não basta: comparar ao entregar; resposta A atrasada nunca preenche B/null.

## 4 Persistência e autoridade

`workspace.validate/save/get/patch` seguem C06, sem inventar endpoint/DTO de autorização. Server resolve owner/store/Location atuais; `expectedRevision` compara atomicamente a WorkspaceRef salva e só grava documento validado. Uma revisão contém composição + overrides; S05 separa estado efêmero e rascunhos. Prévia local não é autorização de persistir. Texto inválido permanece no rascunho local protegido, não substitui composição salva válida.

Composição salva segue retenção de Q03/S13, com aliases revalidadas; conteúdo sensível em disco só com proteção demonstrada. Importar/migrar não restaura ActivationRef, ApprovalRef, token ou autoridade. Sem Git utiliza o contexto Studio de S02; manifesto não escolhe principal/storageID/path e nunca preenche `Location.workspaceID` com recurso Fabric.

## 5 Prova e bloqueios

Todos os nomes abaixo são testes futuros, sem execução ou prova de compilação. Cada negativo deve falhar pelo controle indicado; fixture é apenas fixture. Casos de limite também exercitam abaixo/no/acima de cada seed.

| ID | Teste futuro / entrada positiva → asserção | Entrada negativa → asserção |
| --- | --- | --- |
| FS-DEC-001 | `declaration-solid-registry`: inventário e investigação → mesmos loaders/renderer Solid registrados | HTML gerado ou loader de outro framework → recusa; títulos diferentes não contam como prova |
| FS-DEC-002 | `declaration-origin-parity`: quatro origens com JSON equivalente → mesmo efetivo/diagnóstico | IA com prop extra → mesmo erro que arquivo, sem bypass |
| FS-DEC-003 | `declaration-closed-data`: título com markup → texto inerte | campos script/css/url/grant/token, tag YAML, chave duplicada → inválido e zero efeitos |
| FS-DEC-004 | `declaration-no-effects`: abrir/salvar/mover/migrar → nenhum comando/workload | source mutante ou binding para run → rejeitado antes de qualquer efeito |
| FS-DEC-005 | `declaration-unknown-id`: componente conhecido → preview | component/action revision inexistente → caminho localizado e autoria intacta |
| FS-DEC-006 | `binding-exclusive-typed`: ExecutionRef? ligado e consumidor não ligado → só ligado muda | dois escritores, ResultHandle→ExecutionRef ou ResourceSet→singular → recusa sem coerção |
| FS-DEC-007 | `binding-projection-dag`: executionResource → mesma identidade/recurso | projeção livre, ciclo ou row→endpoint → grafo rejeitado |
| FS-DEC-008 | `binding-null-late`: A→B→null → invalida, suspende e pede seleção | entregar A/B após null ou mesmo resourceID em outro contexto/args → descartado e zero refresh |
| FS-DEC-009 | `binding-activation-scope`: seleção autorizada → usa ativação vigente | seleção fora do conjunto/TTL vencido → bloqueia, sem renovar budget |
| FS-DEC-010 | `recipe-determinism`: mesmo input/versões/janela → efetivo idêntico | recipe/slot desconhecido → erro, sem sorteio/fallback |
| FS-DEC-011 | `workspace-patch-cas`: base atual aceita → nova revisão, IDs intactos | base antiga e customização nova → conflict, sem sobrescrever rascunho |
| FS-DEC-012 | `workspace-migration-review`: migração aceita → revisão nova e zero efeitos | versão futura/ID reaproveitado → só inspeção, bytes originais recuperáveis |
| FS-DEC-013 | `validity-vs-availability`: capacidade conhecida denied → outros painéis úteis | slot inválido junto a capacidade denied → nenhuma montagem parcial |
| FS-DEC-014 | `catalog-semantic-crosscheck`: props/fonte/log schema compatíveis → válido | fonte tabular no leitor de logs/prop errada → diagnóstico sem degraded permissivo |
| FS-DEC-015 | `effective-document-roundtrip`: editar visual/avançado → mesmo JSON efetivo e normalizações visíveis | default que altera intenção sem diff → teste falha |

**BLOCKER S04-COMPILE:** falta materializar/compilar Schema/Protocol, compartilhamento de validação e algoritmo de normalização com fixtures de fronteira; o JSON ilustrativo não prova nenhum deles. **BLOCKER S04-REGISTRY:** metadados/portas e loaders Solid reais ainda precisam de prova conjunta com S05/S07; não definir ExecutionRef/FilterSet/ResultHandle paralelos para suprir essa dependência. **BLOCKER S04-LIMITS:** seeds e parsing limitado precisam de ensaio representativo antes do freeze; dependem do orçamento do lead, não de valores inferidos aqui.
