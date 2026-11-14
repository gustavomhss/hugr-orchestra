# S1 — cinco subfatias executáveis

## Autoridade e identidade

O proprietário pediu nesta conversa: dividir S1 em cinco fatias, preparar as branches e gerar cinco prompts para novas sessões.
Esta delegação subdivide somente S1. S1-01..S1-05 não são as sessões globais S1..S5.
As identidades, branches e namespaces deste kit substituem apenas a atribuição operacional antiga de uma única conversa em genesis-fresh-s1.
Permanecem o baseline, o acervo, os critérios e as obrigações do Genesis. Não há reinício da mineração legada por arms nem mudança de escopo global.

- Repositório: gustavomhss/hugr-orchestra.
- Fonte investigada: 1cde2ff7a71bcf7aecb5d030917b577165135d38.
- Histórico S1 herdado e pai do kit: a8df22ae3a140c58c63f62ce2a634c84f415c943.
- Protocolo original: ee2521a5b966bd505cc95bd1c733e09e12f33531; skill .orchestra/skills/execute-genesis/SKILL.md.
- Campanha: 20261111-v1; protocolo: parallel-v3-fresh; resultados: 20261111-v3-fresh.
- Modo: conversa nova, history_required=false. Os inputs relevantes já estão publicados.
- O commit imutável deste kit é fornecido no prompt de abertura; ler todos os arquivos do kit nesse mesmo commit.
- Cada branch já foi preparada. Aceitar seu HEAD após verificar a descendência e o conteúdo; nunca resetar para o pin.

O registro antigo de execução da S1 é histórico somente leitura. Não exige recuperar handles antigos, migrar sessões ou esperar a coordenação para começar.
Se houver um registro novo de outra execução dentro do seu próprio namespace, conferir o handoff e resolver a colisão real antes de escrever. Não confundir esse caso com o histórico do pai.
Registrar o HEAD observado e gerar execution_id local verdadeiro; UUID local não é ID de conversa ou agente do host.

## Leitura inicial curta

Ler integralmente este COMMON, sua mission.json e inputs.json. Carregar seu sources.jsonl e usar a lista exata de paths/blobs; os títulos e prefixos são descritivos.
Ler AGENTS.md e instruções locais aplicáveis. No protocolo fixado, ler princípios, fatia-1, fresh-start, orchestration, judging e transport; antes das operações, runtime; antes da selagem, handoffs e completion.
A mission.json especializa o escopo e substitui a branch/namespace antigos de fatia-1. Não carregar o corpus inteiro ou todo o histórico antes do primeiro trabalho útil.
O inventário não é prova de compreensão. A partição mantém todas as 2236 fontes e os 36 artefatos L1 históricos como entradas a continuar, sem inventar um número obrigatório de documentos finais.

## Escritas e isolamento

A principal é a única escritora remota da sua branch. Produtores trabalham em áreas locais exclusivas; não presumir filesystems separados entre chats/agentes.
Escrever os resultados no output_prefix da mission.json. Não escrever no namespace de outra subfatia, no kit congelado, nem nos arquivos centrais antigos de S1.
Preservar s1/native-package.json, coverage.json, handoff.json, work.md, ledger, snapshots, corpos e decisões históricos. Não editar genesis-fresh-s1 ou genesis-fresh-final a partir destas missões.

Código de produto só pode mudar quando uma correção/adaptação for estritamente necessária para executar ou comprovar uma obrigação atribuída do Genesis, em um path exato da sua partição.
Não implementar features nem corrigir incidentalmente todo defeito encontrado. Não alterar comportamento para tornar verdadeira uma afirmação: explicar o comportamento observado e seus limites.
Preservar a fonte investigada; qualquer candidato alterado recebe revisão, novos inputs, impacto e provas próprias. Não apresentar execução do candidato como execução do baseline inalterado.
Testes novos estritamente necessários ficam nos diretórios governados dos pacotes atribuídos, com prefixo s1-XX da sua identidade e helpers exclusivos.
Gerados só pelo gerador oficial e pelo dono correspondente. Mudança que gerar output fora da sua autoridade exige encaminhar o patch/proposta completa ao dono.
Esta autorização não inclui mudar AGENTS, contratos/skills da campanha, guards, workflows, aprovações, segredos ou políticas de acesso. Fora da propriedade, preparar a correção concreta para o dono e continuar o trabalho independente.

Isolar checkout, candidato, fontes capturadas, CAS, store, projeção e saídas por execução. Não reiniciar o ambiente servido do usuário ou de outra sessão.
Usar o conector GitHub e lease de HEAD. Não usar gh, login, GH_TOKEN, busca de credenciais, force-push, PR/merge, remoção histórica ou ativação em produção.
Operações Atlas são isoladas e seguem a autoridade efetivamente disponível. Não inventar atores, tokens, políticas, hashes, recibos ou comandos de runtime.

## Produção e reaproveitamento

Começar pela ação concreta indicada na missão. Usar corpos, leituras, suplementos e decisões existentes; refazer apenas o delta necessário.
Congelar necessidade, inputs, critérios públicos e oracle antes da nova produção avaliada. Manter respostas reservadas fora do contexto de produtores e consumidores.
O principal que já leu o oracle cria produtor em contexto novo. Casos conhecidos ficam como regressões; caso novo posterior não aprova retroativamente uma produção.
Construir L1 verificável, L2 entendimento local, L3 relações/impacto e L4 ownership/manutenção. São níveis lógicos: não exigir quatro arquivos por fonte nem quatro chamadas por item.
Cada artefato precisa ser útil para propósito, comportamento, contrato, decisão, impacto ou manutenção. Classificações por grupo para fixtures/gerados/vendor são válidas quando satisfazem a necessidade.
Só avançar um dependente quando seus predecessores obrigatórios estiverem aceitos. Produzir todas as partes independentes sem esperar a camada inteira de outra sessão.
Leitura cruzada de fonte no baseline é permitida e não transfere propriedade. Afirmação dependente de artefato externo exige seu vínculo exato; evidência bruta e aceite semântico não são equivalentes.

Preservar pedidos e respostas visíveis originais, corpos UTF-8 e hashes; nunca solicitar ou registrar raciocínio privado.
Decisões históricas continuam vinculadas aos bytes e ao escopo originais. A cópia de um corpo não cria nova autoria ou novo PASS.
Nenhuma falta de revisão no manifesto antigo permite apagar um parecer real preservado; nenhuma marca supported no manifesto substitui os dois pareceres exigidos.

## Juízes e consumidores

Cada nova conversa cria dois juízes nativos novos, independentes da autoria, com fork_turns=none no primeiro pacote julgável.
Papéis locais: parallel-v3-fresh/S1-XX/J1 e J2. Registrar IDs realmente retornados e manter o mesmo par nos deltas/camadas desta execução.
Ambos cobrem todos os critérios pertinentes. Não criar terceiro voto nem substituir um veto. Não fingir continuidade de handle antigo.
Os juízes não usam ferramentas; fornecer os corpos exatos, trechos decisivos, identidade e critérios necessários, não só links.
Preservar decisões originais; corrigir findings obrigatórios e reapresentar o delta ao mesmo par. Sugestão opcional não aumenta a barra.
O par novo pode reconhecer reuso exato de aceites anteriores e julgar deltas/entrega, sem repetir por rotina a avaliação integral de conteúdo inalterado.

Consumidores são contextos novos sem fonte bruta, resposta esperada ou oracle reservado. Usam ownership.index/read reais ou ponte fiel com pedido/resposta preservados.
Fixar limites de consulta e casos antes de avaliar. Cobrir mudança permitida, violação, impacto, falha operacional e abstenção; adicionar somente lacunas reais aos casos herdados.
Os IDs em mission.json distribuem os casos históricos. O arquivo oracles/consumer-v1.json contém respostas reservadas: não copiar esses campos para prompts de produção/consumo.
Casos de uso direto dos intermediários necessários e manutenção continuam obrigatórios; a sessão não termina apenas por produzir Markdown ou obter PASS semântico.

## Transporte e runtime Atlas

Preservar genesis-native-package/v1, session=S1 e scope=orchestra.s1 para as chaves históricas; subslice_id fica na coordenação/handoff.
Não inventar novos valores de enums ou supor suporte do adapter a S1.1. Usar chaves novas estáveis e exclusivas para novos artefatos locais, por exemplo s1.subslice01.<necessidade>.
Manter cada chave histórica sob seu único dono. Não duplicar uma definição concorrente em outra subfatia.
body.path é relativo ao novo native-package.json, sem absoluto, .. ou symlink. Materializar localmente cópias byte-idênticas necessárias, com origem/hash/autoria preservados.
O pacote selecionado deve conter os corpos e todos os predecessores exigidos. required_artifact_keys e roots delimitam a seleção local; não chamar essa seleção de S1 inteira.

Descobrir o release em genesis-fresh-s4, caminho s4/runtime-release.json sob o epoch atual, e congelar commit, capacidades, código e limites exatos antes de operar.
O release r3 observado no kit tem candidatos diferentes por capacidade, limite de arquivo e recusa de dependências cross-package. Um CI posterior não transfere automaticamente binding ou capacidades.
Não presumir que pacotes separados já podem ser publicados com dependências cruzadas. Se uma operação exigir fechamento local, transportar a cópia exata de predecessor aceito como dependência do mesmo pacote, preservando chave, origem, autoridade e decisões; validar essa transformação.
Se a composição necessária não for suportada, preservar o complemento específico para a união/S4 e continuar o trabalho independente. Não criar importer/leitor/store paralelo nem remover fontes para passar.
Reutilizar controles comuns de S4 com versão/escopo compatíveis. Não reimplementar o motor nem repetir toda a suíte comum cinco vezes.
Binding de runtime, publicação, leitura, consumidor e manutenção têm recibos próprios. Não promover hashes de transporte a versões de input Atlas nem transformar fonte unavailable em absent.
Um bloqueio comum demonstrado não apaga a obrigação local de usar o pacote; ela permanece aberta até prova ou disposição contratual explícita.

## Entrega, provas e economia

Manter poucos arquivos úteis: work.md, execution-ledger.jsonl, native-package.json, corpos/evidências, judgments, matriz única e handoff.json.
Usar todos os 50 IDs do registro original na matriz final, com decisão local, evidência e complemento exclusivamente de composição. Não criar 50 documentos.
Registrar um plano finito de produção/juízes/correções/consumidores e revisá-lo conforme o trabalho. Não inventar uma quota curta que encerre a missão.
Tokens, tentativas físicas e cobrança não expostos ficam UNKNOWN; histórico não reconciliado não é zero. Não fazer chamadas pagas externas como efeito colateral.
Seguir AGENTS: testes de produto em GitHub Actions; typecheck e guard estático conforme as instruções. Não contornar guardas nem chamar teste local de outro nome.
Prova reutilizada deve identificar candidato e caso; testar somente os deltas e riscos reais. CI verde não é aceite semântico e um comando não executado fica NOT_RUN.

DELIVERY_COMPLETE vale somente para a subfatia quando população/necessidades, camadas necessárias, dois juízos, correções, operações, consumidores, manutenção, gates, economia e selo estão completos.
Não marcar a S1 inteira ou a campanha global como concluída. Falta exclusivamente da composição não impede entrega local; falta própria de consumo/revisão/gate não pode ser escondida como global.
Continuar todo trabalho executável até cumprir a missão. Plano, checkpoint, delegação ou PASS de lote isolado não encerram o trabalho.
Se houver impedimento material, descobrir capacidades/rotas realmente disponíveis, registrar erro/operação/evidência/condição de desbloqueio e terminar os itens independentes. O estado fica INCOMPLETE_BLOCKED.

## Publicação e composição posterior

Ler HEAD B e reconciliar avanços. Criar payload P descendente de B; depois selo H apontando artifact_revision=P, sem SHA autorreferente.
Atualizar somente a própria branch, expected_sha=B e force=false. Em conflito de lease, reler e reconciliar. Reler o handoff e bytes publicados.
A resposta final traz link do handoff, commits, cobertura, juízes, provas e faltas exatas.

A coordenação que preparou este kit recebe os cinco handoffs e compõe S1 em genesis-fresh-s1, com escolha explícita de versões e provas cruzadas.
Essa composição inclui o índice/entrada geral do Core, todos os 2236 paths, os contratos cruzados e os vínculos com S4. Nenhuma das cinco sessões assume autoria da união por concluir sua parte.
ROOT continua responsável pela união global S1–S5 em genesis-fresh-final. Não é pré-requisito de início das subfatias.
