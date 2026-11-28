# Rodadas 4 e 6 — revisão fria e calibração

Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Revisores independentes da autoria original: `sol_linus` e `sol_thiel`, ambos `gpt-6.1-sol`. Somente leitura, sem teste ou exploração. O lead arbitrou severidade e aplicou as correções aos documentos. Esta rodada não acrescenta IDs: procura contraprova, condições omitidas e afirmações fortes demais.

## Vereditos

| ID | Revisor | Veredito | Resultado da calibração |
| --- | --- | --- | --- |
| H5 | Linus | APROVE | Join não é protegido por rejeição de nó órfão no LangGraph suportado examinado |
| H6 | Linus | REVISE | Ação colide, mas recursos pedidos diferem; reutilização de permissão exige cobertura de * |
| H7 | Linus | APROVE com precisão | Issuer se perde na persistência/commit; token antigo é exposição central na troca de URL |
| L4 | Linus | APROVE com limites | Exige trusted/read population e seat scope; fact continua T2, sem elevação automática de governança |
| H1 | Thiel | APROVE | Read real continua disponível com deny específico da Session e consulta política incompleta |
| H2 | Thiel | APROVE condicionado | Documento aberto no browser, servidor sem senha e origem API; sem bypass Basic demonstrado |
| E1 | Thiel | REVISE | Segunda admissão é garantida; duplicar execução/efeitos depende da continuação |
| L1 | Thiel | REVISE | Há reapers de processos, mas não cancelam o owner geral; usar efeito fora desses reapers |
| L2 | Thiel | APROVE | API/core sem exclusividade; undo principal da interface já interrompe antes |

## E1: alteração de prioridade, preservando histórico

Triagem original: P1. Classificação atual pelo lead: **P2**, coerente com T3. A cadeia prova IDs diferentes e duas admissões para a intenção ambígua. Steers podem ser promovidos juntos; não prova duas ferramentas idênticas executadas. Efeitos/custo adicionais permanecem impacto possível e precisam do teste proposto. O total de IDs não muda; o conjunto anterior de 42 passa de 9 P1/32 P2/1 P3 para 8 P1/33 P2/1 P3.

T3 também foi proposto P1 por seu autor e registrado P2 pelo lead: execução/custo/import parcial estão sustentados; efeito externo de ferramenta continua condicionado a modelo, permissões e comportamento não reproduzidos. A severidade não foi aumentada para compensar a reclassificação.

## H5: contraprova de compilação investigada

Linus leu LangGraph 1.2.16 do cache uv, dentro da faixa declarada >=1.2,<2: graph/state.py:1129 valida nomes/entrypoint, mas não exige alcançabilidade de todos os nós; compile anexa waiting_edges separadamente em linha 1394. Pregel valida canais/assinaturas/interrupções, sem rejeitar nó approval inalcançável. Portanto a contraprova não elimina o bypass. Cenário deve manter grafo/reducers, checkpointer e thread_id válidos. Não houve compile/invoke executados.

## H6: origem e recurso autorizados

O ID team_message colide e registro posterior vence em novas materializações. A identidade capturada protege catálogos anteriores contra troca durante settlement. A ferramenta nativa pede resources:[to]; MCP pede resources:["*"]. Logo, uma regra restrita a destinatário não é automaticamente reutilizada. O cenário sustenta P1 condicionado a política que cubra *, como o perfil direct examinado em roster.ts:81; metadata.server/tool não participa da decisão de PermissionV2.

## H7: duas trocas diferentes

SDK 1.32.0 patched compara issuer da URL do authorization server selecionado; unstamped é aceito como legado. Provider pending mantém objetos na memória até commit, quando o round-trip perde os campos. Trocar apenas authorization server da resource URL pode expor refresh token e, conforme método, client secret antigo; trocar resource URL com DCR pode reetiquetar token antigo, enquanto o client secret usado nessa segunda operação pode ser novo. State/PKCE/resource indicator não bloqueiam esse primeiro envio.

## L4: limites da prova e da população

O replay direto exige população trusted, fact que reprova no índice atual e actorInScope. Política ausente/malformada não autoriza scopes por si. O nome trusted não autentica logs repositórios. O fact minerado continua T2: adulterar claims não o transforma automaticamente em T0/T1 ou aprovação de execução. O desvio é prosa/identidade não vinculada ao fact admitido e servida por Own, inclusive advisory/papel derivado. Teste precisa escolher anchor consultado e texto curto para não confundir seleção/budget com proteção.

## L1: reapers não são cancelamento completo da execução

session-process.ts:255–259 observa deleted e encerra processos registrados; app-dock/application-tools.ts:124–138 fecha workspace/processos/terminais Linux geridos. Esses mecanismos devem constar como mitigadores. Task background em tool/task.ts:226–229 usa wake do filho e oferece entrada real de owner independente; foreground possui cancelamento encadeado. O teste do defeito deve bloquear ferramenta/efeito não encerrado pelos reapers, sem afirmar sobrevivência de todos os subprocessos.

## Demais precisões

H1 não supera denies do agente, sandbox ou roots independentes; usa recurso interno permitido pelo agente e negado só na Session. H2 exige navegação do browser para o documento, não sua leitura como bytes/texto. Same-origin satisfaz as proteções CORS/ticket PTY naquele cenário sem senha. L2 remove mensagens da projeção e inputs após a fronteira, não todo o event log durável; UI já interrompe no undo e a falha é do contrato público/concorrência da API.

Nenhum dos nove mecanismos foi retratado. Seis tiveram aprovação e três exigiram revisão material de redação/alcance; um desses três mudou de prioridade. Continua faltando reprodução hospedada para todos. Confirmação estática independente não é substituto de execução de teste.

## Rodada 6 — contraditório dos três P1 novos de configuração

Depois da descoberta G1/G2, o usuário já havia ampliado o grupo para sete Sol. O lead despachou a Geohot, que não escreveu esses itens, a revisão fria de H11/H12/H13: bootstrap/trust antes da avaliação Markdown, binding entre origem configurada e credencial global, e containment do AGENTS descoberto até o request do modelo. O despacho proíbe executar payload/parser, ler arquivo sensível real ou usar teste local. Seu resultado será anexado após o retorno e não acrescentará IDs por si.

### Resultado da rodada 6

| ID | Veredito Geohot | Precisão incorporada ao relatório |
| --- | --- | --- |
| H11 | APROVE | Gatilho é aquisição dos serviços da Location; picker/fs.list isolado não foi demonstrado |
| H12 | APROVE | Runner nativo/API suportada/provider permitido e credencial disponível; default só afeta seleção que o consulta |
| H13 | APROVE | Procfs exige Linux/acesso/symlink; sentinela textual externa é teste portátil |

H11 foi seguido por config discovery → transform → boot/flush → parser, sem trust no leitor; engine executável foi conferido no gray-matter exato. H12 foi seguido até URL efetiva e Auth aplicando segredo, sem gate de origem; host Claude não foi incluído sem prova. H13 foi confrontado com FSUtil, backend Node e TextDecoder: não há filtro de containment/NUL/binário no caminho; a flag opt-out é false por default e o baseline chega ao request.system.

Os três mantêm P1 por mecanismo estático, sem execução de payload. Somando as duas revisões, foram confrontados 12 IDs distintos: nove aprovações e três revisões materiais de alcance; E1 mudou para P2. Todos os 11 P1 atuais receberam contraditório de agente diferente do autor. Não houve retratação de mecanismo, nem conversão dessa revisão em alegação de teste de runtime verde.
