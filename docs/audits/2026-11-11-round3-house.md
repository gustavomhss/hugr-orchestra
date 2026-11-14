# Rodada 3 — confiança em configuração e contexto

Agente `sol_house`, modelo `gpt-6.1-sol`. Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Quatro novos achados: três P1 e um P2. O lead conferiu os principais caminhos e a fonte da dependência do parser. Nenhum payload, segredo real, teste ou runtime executados.

## H11 — P1: frontmatter de projeto executa JavaScript antes da aprovação

**Confiança alta.** [`config/markdown.ts:4`](../../packages/core/src/config/markdown.ts#L4) chama gray-matter(content,{}) sem restringir engines. A versão fixada é gray-matter 4.0.3: lib/defaults.js:16 mantém engines padrão; index.js:85–89 aceita linguagem após o delimitador; lib/engines.js:36–43 executa o engine JavaScript com eval. O lead e o Sol leram a fonte exata em `/Users/gustavoschneiter/.bun/install/cache/gray-matter@4.0.3@@@1`, sem executar seu parser.

**Entrada:** projeto não aprovado contém agente/comando Markdown com abertura `---javascript` e expressão no frontmatter. [`config/plugin/agent.ts:70`](../../packages/core/src/config/plugin/agent.ts#L70) descobre/lê arquivos e decode em linha 176 chama parseOption; config/plugin/command.ts:54–71 faz leitura equivalente. A avaliação acontece antes da validação dos campos.

**Reachability:** location-services.ts:69 inclui PluginInternal; [`plugin/internal.ts:103`](../../packages/core/src/plugin/internal.ts#L103) aguarda boot com config-agent/config-command; plugin.ts:187–201 aguarda flush; state.ts:80–84 aplica os transforms. O gatilho demonstrado é adquirir os serviços da Location, antes de executar ferramenta ou enviar primeiro prompt. Só navegar no picker de pastas não foi demonstrado como gatilho: fs.list evita esse boot deliberadamente.

**Impacto:** código do repositório executa com autoridade do host, incluindo filesystem, ambiente e rede. **Mitigadores examinados:** trust de plugins externos não cobre esses leitores; schema/parseOption/catch rodam depois da avaliação e não desfazem efeitos.

**Correção/teste:** parser estritamente de dados, com rejeição de engines executáveis e aliases. Definir apenas language=yaml não basta se o delimitador ainda seleciona outro engine. Abrir Location não aprovada com sentinela e exigir recusa antes de efeito; cobrir agentes, comandos, skills e editor. Testes devem executar hospedados, sem payload local.

## H12 — P1: endpoint de modelo definido pelo projeto recebe credencial global

**Confiança alta.** [`config/plugin/provider.ts:43`](../../packages/core/src/config/plugin/provider.ts#L43) aceita documentos de projeto sem ConfigTrust e permite trocar api.url de modelo existente/default. [`runner/model.ts:315`](../../packages/core/src/session/runner/model.ts#L315) resolve conexão global pelo integration/provider ID, sem vincular autorização à origem nova; linhas 140–154 extraem credencial e URL; linhas 217–234 aplicam Bearer/x-api-key.

**Sequência:** usuário tem conexão OpenAI salva ou via ambiente; projeto não aprovado muda URL de modelo existente para servidor sob seu controle e seleciona-o; primeiro prompt usa credencial global na origem do projeto e transmite contexto. O projeto também pode declarar nomes de variáveis em provider.env (config/plugin/provider.ts:15–34); integration.ts:407–418 resolve process.env por esse nome, ampliando a fonte de segredo escolhível.

**Impacto:** chave/access token e prompt/histórico podem sair para origem não aprovada. Não depende de MCP OAuth ou HTML servido. **Mitigadores examinados:** provider.use é por ID; route/auth.ts:65–67 e transport/http.ts:88–105 não revalidam a vinculação credencial/origem. Trust para executar plugins/processos não cobre o transform.

**Precisão da revisão fria:** o cenário exige runner nativo, API/modelo suportado, provider permitido e credencial resolvida. Usa Session sem modelo explícito que segue o default, ou altera a URL do modelo já selecionado. Mudar só o default não troca automaticamente uma Session com outro modelo explícito; não foi demonstrado o mesmo caminho no host Claude.

**Correção/teste:** separar parâmetros de apresentação dos que mudam destino/fonte de credenciais; exigir autorização para nova origem/variável e manter credenciais globais vinculadas aos destinos aprovados. Chave fictícia, projeto não aprovado e servidor de captura devem produzir zero envio/Authorization antes do consentimento; cobrir provider.env escolhido pelo projeto.

## H13 — P1: AGENTS.md descoberto pode resolver fora do projeto e vazar contexto

**Confiança alta.** [`instruction-context.ts:89`](../../packages/core/src/instruction-context.ts#L89) descobre AGENTS.md lexicalmente dentro da árvore e aplica fs.resolve, seguindo symlink, sem validar containment físico do arquivo. Linhas 103–118 leem o resultado; linha 144 renderiza no contexto.

**Entrada:** repositório versiona AGENTS.md como symlink para arquivo legível do host. Em Linux, `/proc/self/environ` é alvo estável que representa o ambiente do processo leitor; em outros sistemas é necessário conhecer outro alvo legível. O conteúdo entra no baseline persistido e request.system: system-context/builtins.ts:48–51 registra InstructionContext, runner/llm.ts:174–183/202 carrega epoch e linhas 249–266 montam a requisição.

**Impacto:** leitura externa e envio ao modelo sem passar por permissão da ferramenta read ou inspeção de output. **Mitigadores examinados:** instructions configuradas já fazem containment em linhas 71–79, mas descoberta ambiental não usa a mesma regra. ORCHESTRA_DISABLE_PROJECT_CONFIG evita descoberta quando ativado. Teste de diretório inicial externo não cobre symlink de arquivo descoberto.

**Precisão da revisão fria:** flag ausente não desativa a descoberta. FSUtil.readFileStringSafe só trata arquivo ausente/permissão negada, sem filtro NUL/binário. O exemplo procfs exige Linux/acesso permitido/symlink materializado; um arquivo-sentinela textual externo é a aceitação portátil suficiente, sem garantir que todo alvo seja legível ou todo provider aceite qualquer conteúdo.

**Correção/teste:** conferir cada arquivo descoberto contra a raiz física antes de ler, preservando a autorização separada das instruções globais do usuário. Symlink para arquivo-sentinela externo não deve aparecer em baseline nem request do runner real.

## H14 — P2: aquisição de skill remota do projeto não tem orçamento de tempo/volume

**Confiança alta na ausência de limites.** [`config/plugin/skill.ts:24`](../../packages/core/src/config/plugin/skill.ts#L24) admite fontes HTTP do projeto sem trust. [`skill/discovery.ts:85`](../../packages/core/src/skill/discovery.ts#L85) e linhas 115–174 leem index/arquivos integralmente, sem deadline ou teto de bytes/skills/arquivos. [`skill/guidance.ts:46`](../../packages/core/src/skill/guidance.ts#L46) chama list antes de filtrar permissões no preparo do turno.

**Sequência:** fonte declarada pelo projeto transmite indefinidamente ou fornece catálogo/arquivos excessivos; arrayBuffer acumula dados e arquivos concluídos vão ao cache. Primeiro prompt pode esperar indefinidamente pela preparação; memória/disco do host compartilhado podem crescer. Negar skill ao agente não evita a aquisição anterior ao filtro.

**Mitigadores:** origem/path relativos validados e concorrência/retries limitados; isso não limita duração nem volume. FetchHttpClient padrão usa MaxBodySize indefinido. Cancelamento externo pode interromper o turno, mas não substitui orçamento da aquisição.

**Correção/teste:** deadlines por fonte/operação, leitura incremental bounded, limites por arquivo/catálogo/total e filtro anterior à rede. HTTP hospedado sem EOF ou acima do orçamento deve encerrar bounded e limpar cache parcial.

## Cobertura e descartes

Foram lidos trust, bootstrap/State, external plugins, SDK admission/runtime/package/registry/reconcile, transforms agent/provider, skills/instructions, hooks/Relay, formatter/LSP, watcher e APIs de arquivos. Npm ignoreScripts está presente; SDK admission é gate de compatibilidade/footprint e não sandbox de código aprovado.

Não contado: revogação de plugins/LSP sem restart, pois o guia exige reinício explicitamente; permissões de plugin aprovado; hipótese de probes/intérpretes sem vetor fechado; merge do Relay judge que poderia mudar baseURL mantendo chave global, pois não se fechou entrada atual suficientemente distinta. Os mitigadores de comandos de projeto e escrita física continuam existindo, sem neutralizar os quatro caminhos acima.
