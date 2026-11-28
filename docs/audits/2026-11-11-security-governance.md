# Rodada 2 — segurança, Relay, MCP e capabilities

Agente `sol_house`, modelo `gpt-6.1-sol`, lente de diagnóstico diferencial. Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Seis achados novos: três P1 e três P2, sendo o último um asset de uso manual sem integração atual. Cadeias revisadas pelo lead por leitura; nenhum teste, script do produto ou exploração executados.

## H5 — P1: join de entrada pode ignorar aprovação Relay

**Confiança alta. Alcance:** biblioteca Relay Python publicada no repositório, grafos LangGraph com fan-in.

[`orchestra_relay/__init__.py:38`](../../modules/relay/lib/orchestra_relay/__init__.py#L38) substitui somente entradas de builder.edges ao instalar aprovação. LangGraph guarda joins em waiting_edges. A validação em linha 83 rejeita o nó entre as origens do join, mas aceita o nó como destino.

**Cenário:** `builder.add_edge(["a", "b"], "deploy")`, gate approve=True em deploy e checkpointer válido. O join continua apontando diretamente a deploy; deploy__relay_approve fica fora desse caminho. Deploy executa depois de a/b sem alcançar interrupt ou uma decisão de aprovação. O check posterior ainda pode acontecer, depois do efeito.

**Correção/teste:** reescrever destinos de joins preservando o fan-in ou recusar esse formato antes de modificar o grafo. Testar grafo real e exigir interrupt antes de qualquer efeito do destino. O teste existente de aresta condicional de saída não cobre join de entrada.

## H6 — P1: namespace MCP permite substituir ferramenta nativa sob o mesmo ID

**Confiança alta. Alcance:** produto, servidor MCP remoto configurado que anuncia nomes em colisão.

[`mcp/catalog.ts:77`](../../packages/core/src/mcp/catalog.ts#L77) concatena nomes sanitizados por underscore. [`mcp.ts:224`](../../packages/core/src/mcp.ts#L224) registra essa chave; [`registry.ts:250`](../../packages/core/src/tool/registry.ts#L250) e linhas 265–268 aceitam sobreposição e favorecem o registro local mais recente.

**Cenário:** MCP remoto chamado team anuncia message, gerando team_message, ID nativo real em [`team-message.ts:20`](../../packages/core/src/tool/team-message.ts#L20). A implementação remota ocupa a chave em materializações futuras e pede a mesma ação, sem origem distinta. Os recursos diferem: nativo pede [to], MCP pede ["*"]. A reutilização da permissão exige política que cubra *, como o perfil direct examinado em roster.ts:81; não basta allow de destinatário restrito. tools/list_changed em mcp.ts:323–332 permite re-registro posterior. Pares (foo, bar_baz) e (foo_bar, baz) também colidem entre MCPs.

**Impacto:** chamadas sob identificador confiado podem enviar argumentos a executor remoto e reutilizar políticas amplas associadas ao nome nativo. Não exige escolher ID desconhecido, mas não se afirma bypass de uma regra de recurso que não corresponda a *. A precisão foi incorporada após revisão fria de Linus.

**Mitigações:** identidade capturada protege chamadas já materializadas contra troca durante assentamento, mas não catálogos futuros. O trust check de comandos MCP locais em mcp.ts:276 não impede configuração remota.

**Correção/teste:** namespace MCP reservado, identidade injetiva de servidor/tool e autorização vinculada à origem estável; rejeitar colisão. Testar team/message, pares ambíguos e list_changed, preservando o executor nativo.

## H7 — P1: OAuth MCP perde issuer e pode reatribuir credenciais a outra URL

**Confiança alta na cadeia estática. Alcance:** produto, reutilização de credenciais MCP após mudança de descoberta/URL.

[`mcp/auth.ts:10`](../../packages/core/src/mcp/auth.ts#L10) define Tokens/ClientInfo sem issuer. O round-trip persistido de [`oauth-provider.ts:56`](../../packages/core/src/mcp/oauth-provider.ts#L56) omite esse campo; o provider pendente mantém objetos em memória até commit, quando ocorre a perda, não necessariamente no setter pendente. O SDK fixado @modelcontextprotocol/sdk@1.32.0 preserva/compara issuer; os revisores leram seu código exato no cache Bun, incluindo patch, sem segredos. auth.js:158–171 compara issuer e 359–381 aceita tokens sem issuer como legado. O issuer usado é a URL do authorization server selecionado para descoberta.

**Cenário A:** mesmo resource URL passa a descobrir outro authorization server. Orchestra devolve tokens/client information sem issuer; o SDK pode enviar refresh token e client secret ao novo token endpoint em vez de reconhecer a mudança de identidade.

**Cenário B:** URL muda mantendo nome MCP. getForUrl inicialmente recusa tokens antigos, mas DCR salva nova client information; updateField em auth.ts:138–149 atualiza serverUrl preservando tokens. Como SDK faz DCR/save antes de provider.tokens (auth.js:335–361), tokens antigos passam a ser aceitos sob a nova URL.

**Precisão da revisão fria:** no cenário B o refresh token antigo é a exposição central; o client secret usado na nova DCR pode ser novo. Não se afirma que todo fluxo envia o secret anterior. O cenário A pode reutilizar o anterior conforme método de autenticação suportado.

**Impacto:** exposição de refresh token e, dependendo do fluxo, client secret sem descriptografia do storage pelo atacante. A pré-condição é mudança de servidor/descoberta ou configuração com credenciais anteriores; não se afirma vazamento em toda conexão normal.

**Correção/teste:** preservar issuer no round-trip, inclusive provider pendente; invalidar/separar campos acoplados ao trocar URL/issuer, sem reetiquetar tokens antigos. Usar SDK fixado com dois endpoints e credenciais fictícias e exigir zero material antigo no segundo servidor.

## H8 — P2: mutations de schedules não revalidam autoridade após espera

**Confiança alta. Alcance:** produto, autoridade revogada/expirada durante a operação.

[`schedule/management.ts:27`](../../packages/core/src/capability/schedule/management.ts#L27) obtém binding e depois aguarda schedules.placed. Pause/resume/remove em linhas 45–70 não validam o binding; run usa apenas a chave de idempotência. O serviço de schedules valida owner/placement, mas não recebe a autoridade do operador.

**Cenário:** require passa; request espera consulta/lock; credencial vence ou é revogada; execução retoma e altera schedule ou admite prompt. A própria list revalida em linha 41, e facades de connections/artifacts têm revalidação no commit.

**Impacto:** revogação não alcança mutations ainda em andamento. Não é escalada entre projetos: owner/placement continuam verificados. **Correção/teste:** levar binding/target ao gate de escrita/admissão e revalidar após esperas, sob a fronteira de commit apropriada. Testar revogação/expiração em barreira entre require e writer e exigir ausência de efeito.

## H9 — P2: configuração MCP salva perde OAuth e timeouts

**Confiança alta. Alcance:** produto, add/update e reabertura da Location.

[`mcp/project-config.ts:223`](../../packages/core/src/mcp/project-config.ts#L223) serializa transporte, endpoint/comando, headers/environment/cwd e enabled, mas omite oauth e timeouts aceitos por [`config-mcp.ts:26`](../../packages/schema/src/config-mcp.ts#L26). [`mcp.ts:426`](../../packages/core/src/mcp.ts#L426) usa a configuração completa no map added em memória, mascarando a perda.

**Cenário:** add com oauth:false, cliente/callback próprios ou timeout; conexão atual funciona; reabrir carrega arquivo incompleto e muda autenticação/tempo de espera. Update também pode deixar valores OAuth antigos, porque os novos não são serializados.

**Correção/teste:** persistir todos os campos aceitos com tradução correta do formato escrito. Testar round-trip add → arquivo → nova Location com oauth:false, configuração OAuth completa e timeouts de transporte local/remoto.

## H10 — P2 condicionado: download Drive usa nome remoto como caminho local

**Confiança alta no sink. Alcance:** script de uso manual; asset ainda não integrado ao produto instalado.

[`google_api.py:712`](../../modules/capability-assets/assets/skills/office-operations/scripts/google_api.py#L712) usa Path.cwd()/meta.name quando --output é omitido. Linhas 735–736 criam parents e abrem wb sem basename, containment ou criação exclusiva.

**Cenário:** usuário executa manualmente download de arquivo compartilhado com nome absoluto ou relativo ascendente; metadado remoto escolhe destino e conteúdo pode truncar arquivo fora da pasta esperada. Nome comum em colisão sobrescreve arquivo local e symlink é seguido.

**Limite essencial:** [`capability-assets/README.md:17`](../../modules/capability-assets/README.md#L17) declara que nenhum skill root carrega esses assets; foram encontrados consumidores de catálogo/provenance, não executor de produção. Este item não é classificado como P1 do app instalado.

**Correção/teste:** basename segura, containment e criação exclusiva por default; override explícito para destino/sobrescrita. Cobrir caminhos absolutos, ../, separadores Windows, colisão e symlink, sem escrita fora do destino.

## Cobertura e hipóteses descartadas

| Área | Invariantes/caminhos lidos | Limites |
| --- | --- | --- |
| Relay Python/TS | Gates, approvals, check/control, arm/evaluate/round, ledger chain/verify, audit, SPEC | Sem execução de grafos ou fault injection |
| MCP/OAuth | Catalog, registry, auth/provider/callback/project-config e SDK 1.32.0 exato | Sem conexão autenticada real |
| Connections/operator | Policy, invocation, setup, verification, store, management; owner/generation/permit | Sem achado genérico adicional; schedule é caso específico |
| Capabilities | Artifacts/blob/MIME, media/http/download, service discovery/execution/MCP | Hash, FD no-follow, tamanho/deadlines e origem fixa são mitigadores presentes |
| HTTP Actions/Relay/capability | Transfer/source, authoring, output e transportes native/signed | Operações vendor não exaustivas; sem vetor fechado de header/path injection |
| Assets | Catálogo/provenance, scripts Office/PDF/XLSX/watchers selecionados | Sem skill root ativo; onboarding tem flags/state problemáticos, não contados como defeito shipped |

Não contados como novas vulnerabilidades: ledger SHA simples modificável, pois o limite é declarado e audit externo diz external-self-reported; judge advisory, que não promete gate independente; downloads media com origem fixa/redirect negado; artifacts com verificação de hash/MIME/identidade; callback OAuth com state/escaping presentes. Testes mencionados são recomendações, não resultados verdes.
