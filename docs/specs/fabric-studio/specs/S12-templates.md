# S12 — Templates, retomada e portabilidade

**Estado:** proposta técnica; não congelada para implementação.
**Requisitos proprietários:** FS-TPL-001–006; FS-HIS-003–004; FS-HIS-008

## 1 Responsabilidade e integrações

S12 possui catálogo declarativo, derivação, update e export/import; não cria renderer, registry de autorização, grants ou engine de ativação. Consome [CONTRACTS.md](./CONTRACTS.md), C01–C03/C06–C07, S04 para documento/validação/CAS, S05 para continuidade e S02/S03/S06/S07 para contexto/capacidades/recursos/ativação. Mudança, execução e evidência continuam em S08/S09/S10; S13 protege persistência.

Aceitações canônicas em [01-experience.md](../requirements/01-experience.md) e [05-evidence-and-continuity.md](../requirements/05-evidence-and-continuity.md). [DECISIONS.md](../requirements/DECISIONS.md), Q03/Q05/Q08/Q09/Q13, prevalece sobre exemplos anteriores: catálogo inicial exato T01–T12, T14, T17–T21, dezoito objetivos, não mínimo alternativo de onze. A matriz é plano de dependências/prova, não claim de disponibilidade.

## 2 Contrato

### 2.1 Entrada de catálogo e composição derivada

Metadados de template são dados de autoria do catálogo confiável, não outro CapabilityRef/DTO de autorização. Forma proposta: `id`, `revision`, `owner`, `objectiveKey`, `parameters`, `dependencies`, `completionKey`, `consumptionKey`, `exampleMode` e `workspace` (o documento v1 de S04). ID/revision do template não são tool IDs ou WorkspaceRef. Copy padrão usa i18n; títulos pessoais são conteúdo escapado.

`parameters` declara alias, tipo esperado de recurso, obrigatoriedade e instrução i18n; não endpoint/path/tenant implícito. `dependencies` associa CapabilityRef, alias, operação conhecida e essencial/opcional, schemas/versões compatíveis e direitos exigidos pela tarefa; categorias ler/consultar/escrever/executar não são scopes OAuth universais. `completionKey` descreve qual evidência encerra o objetivo; não guarda aprovação. `consumptionKey` explica consulta/execução/transferência separadas, sem afirmar custo gratuito. Fixture é identificada por `exampleMode`, nunca promovida a real.

Derivar preserva documento original e vínculo `{templateID, templateRevision}` junto à revisão pessoal; tool IDs sobrevivem à customização. Overrides/aliases pertencem a S04, buffer a S05. Não altera o template ou espaços alheios. Histórico de origem permite recuperar a base exata necessária ao update; base ausente/incompatível bloqueia merge automático.

### 2.2 Matriz dos dezoito objetivos iniciais

Componentes abaixo são famílias funcionais propostas, não IDs de registry já implementados. Dependências precisam de capacidades **preparadas e qualificadas para aquela operação/contexto/identidade**, parâmetros resolvidos e acesso atual; existência de componente não basta. Nenhuma linha é qualificada nesta etapa, e nenhuma pode ser contada via `unsupported`, mock ou handoff da ação essencial.

| Template / objetivo | Recipe; main · support · inspect | Dependências essenciais a qualificar | Evidência necessária da tarefa |
| --- | --- | --- | --- |
| T01 — entender solução | explore; mapa · recursos/definições · etapa | Metadados/definições e relações autorizadas no escopo | Relações com origem/cobertura, lacunas desconhecidas, explicação ligada à evidência |
| T02 — conhecer workspace | explore; inventário · atividade disponível · recurso | Listagem paginada/metadados; atividade opcional | Inventário datado, todas as páginas/lacunas identificadas, sem vazio por negação |
| T03 — explorar dados | explore; resultados · consulta/perfil/gráfico · coluna/filtro | Query do engine escolhido sob identidade permitida, limites e ativação S07 | Pergunta/consulta, identidade, filtros, rows/truncamento e resposta rastreável |
| T04 — criar carga | develop; fluxo/plano · conectores/definições/checks · etapa | Fonte/conector/gateway e destino qualificados; criação/edição e execução separadas | Artefatos/readback, primeira execução e validação de carga/incremento no recorte escolhido |
| T05 — desenvolver notebook | develop; editor · estrutura/parâmetros/runs · célula/job | Leitura de definição, escrita protegida e run suportado com direitos distintos | Diff aplicado/readback e resultado remoto exposto; não inventar replay por célula |
| T06 — trabalhar com SQL | develop; query editor · schema/resultados · objeto | Contrato do engine/query; operações de objeto/escrita somente onde qualificadas | Consulta/resultado e efeitos identificados; endpoint read-only não demonstra DML |
| T07 — alterar pipeline | change; diff/plano · dependências · atividade | Definição/formato suportados, escrita protegida e run separado | Revisão aplicada/readback e checks; atividade desconhecida preservada |
| T08 — investigar falha | investigate; execuções · logs/mapa/comparação · evento | Status/histórico/definições e logs realmente disponíveis; execute não obrigatório | Diagnóstico com fatos/hipóteses separados e motivo de qualquer log ausente |
| T09 — reexecutar com cuidado | change; plano de execução · histórico/parâmetros · alvo | Execute, eventual cancel e acesso às fontes/destinos; segurança de repetição demonstrada | ID remoto/recibo, terminal observado e validação, sem duplicação por retry ambíguo |
| T10 — acompanhar atualizações | investigate; estado/timeline · dependências/refresh · processo | Metadados/observação e fonte real de freshness; recorrência separada | Origem/intervalo/idade, atraso/falha/unknown distinguidos, sem refresh implícito |
| T11 — validar tabela | investigate; checks · query/resultados · regra | Schema e consultas explicitamente permitidas para checks | Critério, população/amostra, chaves/nulos/regra e resultados, não apenas schema |
| T12 — reconciliar indicadores | compare; comparação/checks · consultas/filtros · medida | Query em cada origem/modelo sob identidades e população comparáveis | Período/filtros/snapshot e diferenças explicadas; incompatibilidade inconclusiva |
| T14 — entender relatório | explore; indicadores/relatório · modelo/mapa · medida/visual | Descoberta/consumo BI apropriados; embedding só opcional qualificado | Ligações/definições verificadas no alcance; deep link seguro não finge embed |
| T17 — explicar acesso negado | investigate; recursos/acesso · requisitos · operação | Evidência visível à própria identidade e requisito da operação | Motivo/requisito e pedido encaminhável, memberships ocultos desconhecidos, sem grant |
| T18 — revisar permissões | compare; matriz · evidências/plano · identidade | Leitura autorizada por superfície; mudança de acesso é efeito separado forte | Cobertura/origem da revisão, readback/checks se houver alteração; parcial não é acesso efetivo completo |
| T19 — conferir segurança dos dados | compare; checks de segurança · modelo/políticas · caso | Testes suportados sob identidades leitoras reais autorizadas e queries pertinentes | Resultado por identidade/mecanismo/escopo, sem impersonation fictício |
| T20 — preparar publicação | change; diff/plano · dependências/settings · recurso | Leitura dos dois destinos e ao menos rota de escrita/deploy com proteção forte demonstrada | Revisão/efeitos/readback e checks pós-publicação; parcial explícito, sem rollback global |
| T21 — entregar trabalho | explore; evidências/resumo · mapa/decisões · recibo | Persistência protegida, sanitização/import/rebind; dados compartilhados exigem autorização própria | Pacote e exclusões inspecionáveis; destinatário autentica/revincula e compreende pendências |

T13, T15–T16 e T22–T30 ficam apenas como disposição de expansão/leitura/handoff seguro, fora da biblioteca pronta inicial. Não removê-los do mapa abrangente, convertê-los em clones ou contá-los nos dezoito. T13 não ganha XMLA nativo por existir no catálogo. T04/T20 não concluem por handoff se faltar a rota essencial; a falta bloqueia o gate integrado de Q08, não reduz o catálogo por conveniência.

### 2.3 Update opt-in e pacote portátil

Update compara três documentos: origem exata O na templateRevision usada, cópia local L na WorkspaceRef atual e atualização U. Diff por tool ID/caminho: só U mudou → propor U; só L mudou → preservar L; ambos mudaram igual → conservar; ambos diferem → conflito explícito. Remover ferramenta alterada localmente, mudar destino/pin ou trocar revisão incompatível é conflito, não resolução por timestamp. Aceite depende de decisão por conflito, nova validação S04 e CAS de L; rejeitar conserva L. Rascunho dirty permanece com o recurso original em S05; update não renova aprovação/ativação nem o sobrescreve.

Export/import reutiliza `workspace.export/import` de C06 com o envelope único decidido pelo lead em C08 authoring-2: `fabric-studio.workspace-package`, version 1, workspace canônico S04, origin opcional de template/revisão, requiredVersions, hints escolhidos e exclusions fechadas. Não é manifesto executável ou segunda definição do documento. Preview mostra versões e exclusões antes de exportar/importar. Seed 512 KiB de pacote UTF-8, documento interno 256 KiB, até 64 hints; excesso/campos desconhecidos/proibidos são rejeitados, sem descarte silencioso para parecer válido. A escolha documental de S12-PACKAGE-SEAM foi resolvida; prova de roundtrip/compilação continua necessária.

Allowlist inicial inclui objetivo/títulos autorizados, parâmetros/aliases rebindáveis, componentes/revisões, props permitidas e bindings/recipe/overrides. Não inclui assets/binários/definições de recursos ou buffers de editor: esses conteúdos exigem exportação separada deliberada, não piggyback no pacote. Nomes/IDs também podem ser sensíveis: preview/revisão explícita antes de sair. Referências portáteis usam aliases, com IDs remotos somente sugestões escolhidas/sanitizadas a confirmar; não levam connectionID/contextID/principal/storageID/path do remetente como autoridade. Exclusions de C08 nunca omite credentials/authority/activations/results/approvals/remote-data/environment.

Excluir tokens/cache, ActivationRef/handles de ativação server-side, grants, ApprovalRef, bearer/Authority, ResultHandle, rows/logs privados, payloads de evidência e dados em rascunho não escolhidos. Recibos privados não são portados como prova autorizante. Apresentação das exclusões sempre informa ausência de dados/credenciais/ambiente/aprovações e lista refs/versões a resolver; não depende de detectar segredos para autorizar campo desconhecido. Importação rejeita campos proibidos em vez de descartá-los silenciosamente e seguir como se fossem válidos.

### 2.4 Contratos por requisito

| ID | Regra operacional |
| --- | --- |
| FS-TPL-001 | Publicação da biblioteca inicial exige os dezoito objetivos da matriz com prova de tarefa/dependências; contar por objetivo, não título, componente ou fixture renderizada. |
| FS-TPL-002 | Antes de abrir/ativar, ficha mostra objetivo, parâmetros obrigatórios, dependências essenciais/opcionais, dados/consumo e evidência de conclusão; resolução ausente não aparece pronta. |
| FS-TPL-003 | Criar cópia valida o mesmo workspace, grava origem/revisão e nova identidade pessoal no contexto atual; template permanece imutável. |
| FS-TPL-004 | O/L/U gera proposta explícita e preserva conflitos/customização; aceite único sobre L atual, sem last-writer-wins nem apagar dirty. |
| FS-TPL-005 | Exportação allowlist + preview; importação validada sem efeitos exige autenticação, rebind e grants atuais próprios, não transportados. |
| FS-TPL-006 | Galeria oferece descoberta/investigação sob leitura apropriada; dependência de escrita/execute só em tarefa/etapa que a exige, sem pedido genérico de Contributor/Admin. |
| FS-HIS-003 | Retomar valida versão/contexto, re-resolve aliases, consulta disponibilidade/acesso atuais e só então permite leitura autorizada; query depende de ativação deliberada S07. |
| FS-HIS-004 | Handoff transfere composição/contexto explicativo sanitizado, não identidade; destinatário resolve recursos na própria instância e vê pendências/exclusões antes de operar. |
| FS-HIS-008 | Exportação/Git é receita/definições escolhidas com versões/exclusões explícitas; nunca backup/restauração integral de dados, credenciais ou ambiente. |

## 3 Estados e falhas

Galeria deriva apresentação de Availability C02 por dependência. `ready` exige versões compatíveis, parâmetros resolvidos, capacidade preparada/qualificada e acesso atual para o objetivo, sem significar grant ou consentimento de execução. Dependência essencial não satisfeita impede anunciar pronto; opcionais indisponíveis podem abrir painel com motivo. `unverified/unsupported/denied/authentication-required` são distintos; ficha não converte ausência de metadados em sucesso.

Escolher → parametrizar → validar → preview → salvar derivada, sem efeitos Fabric. Só ação própria posterior ativa fonte/consulta/execução. Demo usa fixtures visíveis, não credenciais salvas, e não conta como qualificação. Usuário leitor pode obter trabalho útil em T01/T02/T08/T17 no escopo autorizado, sem ser elevado a escritor.

Retomar/importar → verificar versão/schema → resolver contexto atual → rebind → disponibilidade → composição útil ou bloqueio nomeado. Importação válida com aliases ainda não resolvidas pode ser inspecionada/salva sem leitura remota; inválida não monta parcialmente. Referência ambígua pede escolha; nenhum nome seleciona recurso automaticamente. Retomar nunca restaura grants/consentimentos ou reenvia workload; estados históricos conservam idade/modo.

Update disponível não modifica L; solicitar update cria O/L/U. Base ausente pede recuperar origem ou revisão manual da cópia sem alegar merge seguro. Conflito concorrente de WorkspaceRef preserva o trabalho e reabre revisão contra nova base. Versão incompatível mantém pacote/original para inspeção, sem reinterpretar significado de IDs.

## 4 Persistência e autoridade

Composição pessoal e origem seguem Database/migrações/owner/contexto de S04/S13, retenção Q03 até exclusão; rascunhos locais seguem S05. Sem proteção demonstrada não persistir payload sensível. Importação gera nova WorkspaceRef sob o contexto atual criado/resolvido pelo servidor, inclusive sem Git; pacote não move sessão, escolhe Location ou inicializa repositório.

Compartilhar para outro operador é export/import sanitizado conforme Q10, não SaaS/ACL de equipe. Acesso a evidência/dados é fluxo separado e opt-in, não piggyback no manifesto. Importar não instala componente/conector, baixa driver, ativa fonte, confirma plano, concede permissão ou dispara comando. Warnings confiáveis de S05 não podem ser desativados por template.

## 5 Prova e bloqueios

Provas futuras, não executadas; fixture/documentação não substitui qualificação real autorizada nem a aceitação canônica. A matriz de dezoito é roteiro de evidência a obter, não resultado de execução.

| ID | Teste futuro / entrada positiva → asserção | Entrada negativa → asserção |
| --- | --- | --- |
| FS-TPL-001 | `template-initial-objectives`: T01–T12/T14/T17–T21 com evidências por tarefa → biblioteca elegível | clone, mock, essencial unsupported ou handoff T20 → não conta, gate integrado bloqueado |
| FS-TPL-002 | `template-contract-card`: parâmetros resolvidos e dependências qualificadas → ficha explica tarefa/consumo/prova | componente presente sem capacidade qualificada → nunca ready |
| FS-TPL-003 | `template-personal-derivation`: editar cópia e salvar → origem/revisão preservadas | comparar template e cópia de outro contexto → inalterados, sem grants novos |
| FS-TPL-004 | `template-three-way-update`: mudança U disjunta de L → diff preserva ambas após aceite | O→U remove editor dirty ou conflito no mesmo pin/destino → exige decisão, sem LWW |
| FS-TPL-005 | `template-portable-no-effects`: export sanitizado/import rebind → composição própria, zero efeitos | token/ActivationRef/grant/ResultHandle/campo extra → pacote rejeitado, sem aproveitar autoridade |
| FS-TPL-006 | `template-reader-path`: identidade leitora abre inventário/investigação autorizados → tarefa útil | exigir Admin para galeria ou usar escritor privilegiado na query → falha |
| FS-HIS-003 | `workspace-resume-revalidate`: salvo + acesso atual → reabre composição e refs corretas | acesso revogado/conta trocada/ativação vencida → bloqueio atual, sem replay ou grant restaurado |
| FS-HIS-004 | `handoff-recipient-identity`: destinatário autentica/revincula → próprio destino explícito | connectionID/remetente ou evidência privada no pacote → rejeita/não transfere privilégio |
| FS-HIS-008 | `workspace-package-scope`: pacote + versões/exclusões → preview informa o que falta restaurar | anunciar backup integral ou esconder exclusões/refs → teste falha |

**BLOCKER S12-QUALIFICATION:** os dezoito templates dependem de capabilities reais qualificadas, componentes/portas de S04/S05 e provas de tarefa sob identidades autorizadas; nada disso é inferido da matriz. **BLOCKER S12-STRONG-WRITE:** T04/T05/T07/T20 e a jornada integrada de mudança/publicação só contam no recorte cuja proteção de escrita S08/Q07 for demonstrada; ausência de rota forte bloqueia o lançamento, não autoriza handoff como conclusão. **BLOCKER S12-PORTABILITY:** escolha do pacote resolvida pelo lead em C08, mas codecs compiláveis de export/import, sanitização/preview e merge O/L/U com CAS precisam de provas de isolamento, campos proibidos e conflitos. Ambiente/registro/budget de tenant de Q01/Q02 permanecem pré-requisitos externos da qualificação, não decisões a inventar nesta spec.
