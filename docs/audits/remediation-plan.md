# Plano de remediação — uma única PR

Autorização do owner: delegar simples em quatro partes; planejar complexos antes da implementação; uma única PR. Base de implementação: `74bfb2f4474e3c8a2657af6730edbfd90504816c` (`origin/dev` no despacho). Integração: branch `audit-remediation`, worktree `orchestra-fixes`. O snapshot auditado antigo e sua evidência permanecem separados e não serão tratados como prova de falha atual sem revalidação.

## Fluxo e limites

Quatro agentes Sol, cada um em worktree/branch privada e com arquivos de escrita exclusivos. Nenhum abre PR, faz push de branch de trabalho, altera manifest/lock ou modifica a canonical. O lead integra commits, mantém este registro e abre somente a PR agregadora para dev. Branches temporárias criadas por test:ci são infraestrutura de teste, não PRs adicionais. A exigência de uma única PR prevalece sobre a recomendação genérica de dividir PRs por tamanho; commits e revisão serão divididos por responsabilidade.

Todos os 65 IDs receberão disposição no dev atual: reproduzido, já corrigido com evidência, hipótese rejeitada ou correção com teste. Não basta relatório estático antigo. Não haverá fechamento silencioso nem falsa declaração de todos corrigidos.

Testes só em GitHub Actions por test:ci. Typecheck local somente por `bun typecheck` no pacote. Sem restart de app/servidor. Quando dependências faltarem: bun install frozen e ignore-scripts, sem alterar lock. Sem mocks globais novos; testar implementação por API/serviço real e usar seams existentes quando estritamente necessários.

## Primeira onda: 23 critérios simples em quatro frentes

Cada critério deve ganhar regressão primeiro e evidência hosted red→green; se já passar no dev, registrar o caminho que neutraliza o cenário. Rodar teste de regressão sem patch antes de implementar quando aplicável. Alteração de teste por si não é prova. Plan-check e conflict-map mecânicos passaram: cobertura total/disjunta, nenhum site compartilhado de escrita.

### A — Segurança e configuração

Worktree `orchestra-audit-security`, branch `audit-security`. Modelo Sol. Critérios:

- H11: frontmatter JavaScript e aliases recusados antes de efeitos; YAML/JSON suportados continuam dados; fallback YAML preservado. Sobrescrever engine YAML apenas não resolve seleção de linguagem; usar parser de dados/engines explicitamente não executáveis.
- H13: cada AGENTS descoberto passa por containment físico antes da leitura. Instruções globais legítimas continuam autorizadas; alvo externo textual não aparece no baseline nem request.
- H3: controle ToolSafety reconhece path de write/edit reais e filePath do host; caminho permitido passa, proibido continua recusado. Não afrouxar writeRoots/protected paths.
- H9: written→config novo preserva OAuth false, cliente/scope/callback e timeouts; troca de transporte remove campos exclusivos obsoletos. Não substituir referências env não editadas. Upgrade lê timeout numérico legado ou objeto V2; número vira request, objeto preserva startup/request; writer grava objeto completo.
- H2: fs.read devolve conteúdo de projeto com sandbox CSP e nosniff; nunca executar HTML/SVG como documento com autoridade da API. Manter fetch/preview de bytes e não interpolar filename remoto em header. O dev já inclui ambos os headers: exigir regressão da resposta real e registrar já corrigido se passar; não impor attachment sem necessidade.

Escrita: core config/markdown, config/upgrade/mcp e conversão de upgrade, instruction-context, tool-safety, mcp/project-config; server handlers/fs e suas regressões. Guias exclusivos: skills.md e mcp-project-trust.md. Sem mudanças em Protocol; se se tornarem necessárias, voltar ao lead para preservar a fronteira gerada.

### B — Desktop e lifecycle pontual

Worktree `orchestra-audit-desktop`, branch `audit-desktop`. Modelo Sol. Critérios:

- M1: primeiro crash após estabilidade agenda tentativa válida; crash loop mantém limite/backoff; shutdown não reinicia.
- M4: polling/deadline são cancelados no fim de startup ou stop, sem novos fetches após encerramento; preservar readiness rápida de spawn failure já existente no dev.
- M8: falha de transação de draft mantém buffer recuperável; remover somente writes confirmados, preservando updates mais novos. Retry depois da falha grava valor/blobs corretos.
- M12: fim da janela STT fecha socket e encerra entrega tardia/reconnect; finals dentro da janela ainda podem fazer flush. Não afirmar que este defeito mantém microfone ativo.
- M14: capturas concorrentes restauram opacity original única em qualquer ordem de conclusão; usar ownership/contagem/serialização sem snapshots concorrentes inconsistentes.
- M15: perfil default reservado não pode ser tombstonado pelo delete; ou bootstrap usa identidade nova segura. Decisão desta onda: recusar exclusão de default antes de markDeleting, sem ressuscitar partitions antigas.

Escrita: owned-serve, draft-store, live-transcriber, live-frame, ipc-app-dock e testes correspondentes, incluindo novo ipc-app-dock.test.ts na fixture Electron existente. Guard no registry também autorizado se necessário para a mesma fronteira; não duplicar políticas. Código técnico existente de erro pode representar default reservado sem nova string de UI. Guias exclusivos: desktop-startup.md e live-meetings.md. Nenhuma nova string visível não localizada.

### C — CLI e geração de cliente

Worktree `orchestra-audit-clients`, branch `audit-clients`. Modelo Sol. Critérios:

- E3: runTurn sempre encerra stream/poller em finally após erro em submit/wait/history/callback; sinal propagado às operações pendentes; não deixar futuras perguntas depois da falha.
- E4: guardar decisão de permissão até confirmação de entrega; repetir reply após falha transitória sem perguntar de novo nem marcar answered cedo. Tratar request já resolvido sem loop infinito.
- E5: continue pagina até encontrar raiz ou esgotar cursor, sem create indevido depois de primeira página só de filhos.
- E14: import aceita formato nativo e export UI info/parts, preservando texto prometido; shape inválido falha antes de criar Session. Não executar conteúdo durante normalização.
- T3: restauração usa resume:false em toda synthetic, zero provider/host/tool calls, todas as mensagens admitidas antes de concluir. Não mudar a política de execução normal.
- G1: renderer omite campos optionalKey ausentes no payload como faz na query; false/zero permanecem; obrigatórios ausentes continuam inválidos. Corrigir gerador e rodar bun run generate em packages/client; nunca editar generated manualmente.

Escrita: cli turn/run/import e testes; acp/agent apenas para propagar AbortSignal do submit; tooling/httpapi-codegen/effect-headers e testes; generated/generated-effect somente pela rotina do Client. Guias exclusivos: instructions-and-tui.md e session-import.md. Sem alteração na forma do export da UI; o importador é quem suporta ambos os formatos existentes.

### D — Estado de interface e TUI

Worktree `orchestra-audit-ui`, branch `audit-workflows`. Modelo Sol. Critérios:

- E12: invalidação force durante inflight marca geração dirty ou substitui request; depois de liberar resposta A ocorre leitura que publica B. Abranger conteúdo e árvore como uma causa. Não alterar escopo/cancelamento de outras Locations.
- E13: path real preserva #/?/% literal; parsing/decoding ocorre uma vez somente em URI. Round-trip tab→path→read deve selecionar exatamente o arquivo escolhido, inclusive vizinho de nome semelhante e Windows válido.
- E15: escolha explícita de workspace persiste por draft e é restaurada depois de alternância/reload, validando existência. Preservar flag de canal e defaults quando nunca houve escolha.
- T1: formulário sem definição de inputs omite inputs no dispatch GitLab; campos reais continuam tipados e sujeitos à capacidade adequada. Não mexer no transport nativo.
- X1: hidratar perguntas/permissões pendentes no store usado pela tela, reconciliando eventos concorrentes para não ressuscitar request respondido; preservar auto mode e família da Session.
- X2: falha temporária de messages não marca sync completa; reabrir/sync posterior refaz consulta e recupera histórico. Não apagar mensagens live válidas durante recuperação.

Escrita: app-shell file context/tree/path e testes, new-session-workspace-controller/test, actions dialogs/input definitions/test; TUI sync e regressões. Guias exclusivos: hugr-composer.md, workflows.md e session-requests.md. DraftTab.worktree já existe no baseline: consumir contrato atual, sem alterar tabs.tsx. Não alterar timeline/renderers. Antes de qualquer mudança de Session/UI, baseline de produção hosted foi executado: run 43109842284, seis testes passaram; repetir configuração após integração.

## Disciplina de entrega

Antes do código: cada agente confronta seu critério e um pacote vizinho, reporta lacunas e escreve regressões. O lead resolve qualquer fork de design. Commits convencionais pequenos por subtema, sempre sobre baseline pinado; retorno inclui SHAs, arquivos, teste red, teste green, typecheck e findings não aplicáveis. Não abrir PR individual. Scope novo ou critério complexo volta ao lead antes de implementar.

Relay arms foram criados para as quatro worktrees (baseline e diff-check). Sem prova da integração do hook neste host, não se usa o arm como garantia de execução automática; o lead reproduz gates e confere evidência hosted. Guardrail é obrigatório antes de declarar pronto. Um resultado local não será chamado de CI verde.

## Crítica independente e autorização de código

As quatro críticas cruzadas (A→B, B→C, C→D, D→A) foram recebidas antes do GO. Refinamentos: aborto também no settle e não só stop; deadline perdedor cancelado; buffer verificável antes de retry e blobs após reopen; STT stop idempotente e final no limite; opacity com rejeição concorrente; nenhuma mutação antes da recusa do default. CLI exige ausência de unhandled rejection, retry de ACK perdido sem reprompt e import integral validado antes de criar. Gerador preserva null, false e zero e obrigatórios. UI exige interleavings reais, single decode, workspace removido e preservação de eventos live. Segurança exige aquisição real, containment antes de read e chamadas reais de write/edit.

GO enviado aos quatro agentes após essas decisões e baseline de benchmark verde. Produção só depois de snapshot red; comportamento já neutralizado no dev recebe evidência passing e disposição própria. Cada agente confirma a segunda leitura dos critérios refinados.

## Complexos: contratos antes de implementação

Os 42 IDs restantes estão fora da escrita dos agentes desta onda. A análise abaixo é o desenho inicial; cada grupo exige revalidação no dev, regressões e contrato congelado antes de código. Não se implementará um lock, mudança de trust, migração ou protocolo por tentativa.

### C1 — Ownership e efeitos concorrentes: L1, L2, L8, L9, X3, G2

Invariante: um owner por storage+Session; destruição/revert/move obtêm exclusividade antes de ler estado; cleanup não apaga bytes posteriores à captura. Não promover serviço Location-scoped a global levando permissões/fs junto. Separar coordenador global de recursos locais; FileMutation usa mutex global por canonical/storage e mantém formatter/autoridade da Location.

Remoção: fence de admissão/criação e enumeração estável da árvore, interrupção+join de todos os owners, depois remoção. Revert: adquirir ownership antes de carregar Session/snapshot; definir busy/espera sem deadlock. Move: barreira de execução mais CAS de bytes capturadas; escritor externo continua exigindo detecção. Arm: exclusividade/fencing do holder anterior antes de rebind. Embedded: compartilhar coordinator por store ou rejeitar hosts sobrepostos, com lifetime/refcount explícitos.

Prova: testes de barreira para cada interleaving, Sessions distintas continuam concorrentes, teardown de um host não cancela outro, cleanup falho mantém dados recuperáveis. Não introduzir clustering ou recovery de provider pós-crash.

### C2 — Autorização e identidade: H1, H4, H6, H7, H8, H12

Invariante: mesma política efetiva no catálogo e execução; segredo só viaja para origem autorizada; binding revogado não atravessa commit. H1 combina agente+Session com precedência existente, sem saved allow superar deny. H4 usa resolução canônica e external_directory no host; não duplicar política SDK. H6 exige namespace MCP injetivo/reservado e vinculação de origem, com compatibilidade de nomes/políticas planejada. H7 preserva issuer e invalida campos acoplados ao trocar URL; dados legados unstamped precisam migração/reauth explícitas, sem perder todas conexões. H8 leva binding até commit e revalida depois de esperas. H12 separa configuração de projeto de autorização de destino/fonte de segredo, sem bloquear custom providers globais aprovados.

Prova: deny específico, symlink externo, colisões e refresh, dois issuers/endpoints fictícios, revogação em barreira e endpoint de projeto sem credencial transmitida. Rollback de política nunca restaura envio inseguro silencioso.

### C3 — Intenção e reconciliação: E1, E2, E6, E7, E8, E9, T2

E1 exige identidade durável da intenção ambígua por draft/Session/delivery, invalidada apenas por nova intenção. E2 exige snapshot+fence de eventos para transcript/status na reconexão sem sobrescrever live updates. E6 publica disponibilidade por engine; E7 representa opções canônicas da variante antes do lowering. E8 stream exige terminal/falha durável. E9 overflow é erro explícito ou fluxo controlado, nunca perda silenciosa. T2 divide frames antes do bound e alinha limites de admissão/evento; não escolher teto arbitrário incompatível com mídia admitida.

Prova: ACK perdido, reconexão com status omitido, protocolo suportado por engine, variante até prepare, EOF truncado, burst WS e mesmo SSE em chunkings diferentes. Preservar um stream por turno e histórico recarregado em continuação.

### C4 — Projeções, prova e memória: L3, L4, L5, L6, L7, L11

L3 redefine epoch atomicamente com revert sem perder fontes indisponíveis. L4 reconstrói identidade/claims/carriers pelos fatos reprovados, respeitando tier e scopes; acumuladas exigem evidência própria. L5 ordem do log deriva do commit causal, não horário posterior; distinguir replay de clone de regressão de estado local. L6 publica CAS completo atomicamente e verifica dedup existente; restore confirma leitura e trata miss. L7 valida atualidade no reserve/consume como dispatch. L11 usa identidade de operação e journal recuperável para aplicação+decisão, com recovery serial determinístico antes de aceitar descarte.

Prova: A→B→revert, adulteração isolada de row, escritor atrasado após commit, CAS parcial, HEAD alterado pós-aprovação e I/O entre arquivos. Plano de migração/compatibilidade de logs deve preceder qualquer formato novo; não editar snapshots históricos para esconder divergência.

### C5 — Recuperação, distribuição e lifecycle: M2, M3, M5, M6, M7, M9, M10, M11, M13

Process adapter precisa settlement exatamente uma vez para start/error/exit/close e supervisor perdido, respeitando reapers atuais. Migrações precisam ponto de recuperação por lote, validação integral e conversão atômica de journal, sem alterar migrations shipped. Releases são retomáveis por identidade verificada de bytes já publicados, sem sobrescrever conteúdo divergente; feed tem finalização segura. Live startup usa geração/cancelamento de recursos tardios; finalização de meeting tem entrega recuperável de pendências e fim explícito de retries impossíveis.

Prova: start fail e wait rejection, quatro startups em lote parcialmente falho, journal legado misto, falhas intermediárias de publicação por transport simulado, Stop em barreira de startup e append pendente ao finalizar. Nenhuma publicação/instalação real será usada como teste.

### C6 — Execução limitada e fontes externas: H5, H10, H14, E10, E11, N1, N2

H5 precisa reescrever join preservando fan-in ou recusar formato antes de mutar grafo. H10 é asset manual: nome remoto vira basename segura e criação exclusiva. H14 tem orçamento por fonte/arquivo/catálogo e deadline; permissões filtram antes de rede quando possível. E10 requer regex limitada ou worker terminável, não timeout cooperativo falso; E11 aloca estado por execução Effect e entrega snapshots. N1 vincula run à vida do Env sem matar host principal; N2 distingue erro recuperável de inventário de morte definitiva e conserva deadline/cap.

Prova: grafo real com join/checkpointer, nomes absolutos/symlink, servidor sem EOF, regex em isolamento externo, reuso concorrente do Effect, terminate Worker com host vivo e uma falha List recuperável. Biblioteca/asset sem consumer produtivo não recebe falsa atribuição à instalação padrão.

### C7 — Agenda e defaults: L10

Resolver agente efetivo do owner pela mesma Location usada no runtime, incluindo default configurado e mudança posterior de default. Não hardcode de seat nem persistência oportunista de agente em toda Session. Testar criação via ferramenta e primeiro slot em Session com agent omitido.

## Gate único de integração

Uma única branch/PR agrega commits revisáveis e evidência por ID. Cada unidade tem hosted testes change-scoped e typecheck local; ao final, suite/epic uma vez e benchmark de produção comparável. Guardrail, boundaries, spawn imports e regeneração devem passar no SHA final aplicável. Não publicar release, não fazer merge sem aprovação do owner e não usar labels de bypass. As disposições e SHAs serão registradas em remediation-status.json conforme cada entrega.

## Contrato executável C6/E11 — congelado antes do patch

O lead revalidou executeWithLimits no dev: ToolRuntime e logs são alocados na construção do Effect. A correção envolve toda alocação por execução em Effect.suspend e publica cópias da lista de toolCalls em todos os resultados (success, parse/host failure e timeout). Validação síncrona de opções públicas permanece no construtor. Sem nova API, dependência, scope ou consumer produtivo atribuído.

Regressão nova execution-isolation.test.ts usa ferramentas reais descritas por Schema: mesmo Effect via execute e make().execute duas vezes com orçamento1 e logs isolados; execução ilimitada posterior preserva JSON do primeiro resultado; duas execuções concorrentes encontram barreira com budgets próprios. Empty-code, interruption, timeout e host failure continuam cobertos por codemode.test.ts existente, incluído no gate green. Crítica independente solicitada ao agente Sol de modelos antes do patch.
