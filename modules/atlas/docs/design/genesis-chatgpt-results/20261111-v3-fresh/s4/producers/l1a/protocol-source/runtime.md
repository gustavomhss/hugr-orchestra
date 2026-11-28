# Runtime das cinco sessões novas

## Missão e identidade

Produzir entendimento útil e verificável do Orchestra com subagentes nativos, preservá-lo
nos tipos existentes do Atlas e provar seu consumo pelos leitores reais. Aplicar os
axiomas e critérios da [campanha](campaign.md), sem transformar preparação em entrega.

- Campanha lógica: `20261111-v1`; protocolo: `parallel-v3-fresh`.
- Execução nova: `20261111-v3-fresh`; branches `genesis-fresh-s1` até `genesis-fresh-s5`.
- Fonte inicial: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Cada sessão escreve em `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/sN/`.
- ROOT integra em `genesis-fresh-final`; nenhuma liberação de ROOT precede o trabalho local.

As conversas começam vazias. Histórico, IDs, quotas e tentativas de conversas antigas
não são pré-requisitos de bootstrap. ROOT reconcilia a história da campanha; a sessão
registra somente seu trabalho novo e qualquer reúso explícito, sem alegar custo histórico zero.
`nativeChatGPT` nomeia a origem das respostas, não uma API/importer já implementado.

## Primeiro trabalho real

1. Confirmar GitHub, sandbox, subagentes, ferramentas e limites efetivamente disponíveis.
2. Ler `AGENTS.md` e as instruções aplicáveis ao código envolvido; fixar fonte e protocolo.
3. Carregar a população já atribuída. Fechar inputs, necessidade, critério e oracle do
   primeiro WP; despachar produção L1 enquanto o restante do inventário é refinado.
4. Guardar pedidos e respostas originais, corpos e hashes no [pacote nativo](transport.md).
5. Julgar com o par local, corrigir e avançar dependentes aceitos; completar a população
   exigida antes de declarar a camada/domínio entregue. Não esperar importer para produzir.

Distinguir fonte inicial, fonte realmente observada, protocolo, candidato de código e
commit de transporte. Alteração de código exige revisão e provas dos dependentes afetados;
não relatar execução do candidato como se tivesse ocorrido no baseline inalterado.

## Ambiente mínimo, sem inventar capacidades

Usar checkout autorizado existente ou materialização verificável pelos meios disponíveis.
Apenas arquivos reconstruídos não provam HEAD, histórico, tracking ou trust funcionais.
Não fabricar um commit local com aparência do SHA original. Para operar, registrar a
identidade real da cópia e verificar os inputs pelos quais a operação responde.

O shell do sandbox serve para trabalho autorizado. A máquina do dono não é esta rota.
Usar o GitHub conectado; não executar `gh auth login`, preencher `GH_TOKEN` ou extrair
credenciais. Uma ferramenta ausente em um chat não prova ausência em todos os executores.
Instalar dependências permitidas conforme manifestos/lockfile e regras do ambiente.
Bun é necessário ao script piloto atual; Node sozinho não executa suas APIs. [R1]

Isolar checkout/candidato, corpus, CAS, projeção e store por sessão/execução. Subagentes
podem compartilhar filesystem: atribuir escritas disjuntas e coordenar commits no principal.
Não alterar o estado servido nem o pacote ainda julgado de outra sessão.

## Contrato comum disponível desde o início

Cada sessão publica `native-package.json` em seu namespace, conforme [transport.md](transport.md).
O formato conserva corpos, autoridade, lacunas, fontes, receita, dependências e revisões.
Ele permite produzir agora e adaptar depois; não declara que Atlas já o importa.

S4 implementa a adaptação mínima desse transporte para `OwnershipBody`, `OwnershipResult`,
`OwnershipContract`, `OwnershipReview`, `OwnershipReceipt`, `OwnershipArtifact` e
`OwnershipManifest`. Reutilizar portas/CAS/validadores existentes; não criar um leitor de
Markdown paralelo nem nova autoridade. Os tipos e suas restrições estão em [R2].

O piloto `ownership-pilot.ts` tem corpus, scope, receitas e reviewers históricos próprios.
`prepare` e `publish` não são importação genérica. Não substituir reviewers históricos,
reusar aprovação semântica como binding de runtime ou alterar um gate só para obter PASS.
`read` e `index` usam os leitores reais, mas não fabricam uma publicação ausente. [R1]

## S4: liberar a capacidade compartilhada cedo

S4 mantém duas frentes: conhecimento do próprio domínio e implementação mínima do runtime.
Priorizar um primeiro caminho real de pacote nativo → candidato → binding → leitura isolada,
com uma produção nativa efetiva. Publicar a capacidade comprovada sem esperar todo o L1–L4
próprio. Rebuild/recovery podem chegar por revisões posteriores; nenhum estado é presumido.

Arquivo de descoberta fixo na branch `genesis-fresh-s4`:
`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json`.

O release registra, de forma compacta:

| Campo | Conteúdo exigido |
| --- | --- |
| `release_id`, `supersedes` | Identidade única e revisão anterior, quando houver. |
| `source_revision`, `candidate_revision` | Fonte e commit do código realmente executado. |
| `transport_contract_ref` | Commit/caminho/hash de `transport.md` utilizado. |
| `runtime_versions`, `known_limits` | Versões observadas e limites que afetam consumo. |
| `entrypoints` | CWD, argv reais, entradas/saídas e variáveis de caminho a preencher. |
| `isolated_state_rules` | Onde cada consumidor cria seu próprio estado sem colisão. |
| `authority_prerequisites` | Política e autoridade reais exigidas por cada passagem. |
| `capabilities` | Estado e recibos separados de importação, index/read, rebuild e recovery. |
| `judge_refs`, `gate_refs` | Pareceres, comandos/runs e resultados reais, com hashes. |

Não preencher comandos com nomes presumidos. Primeiro implementar/executar; depois registrar.
Criar o commit do candidato antes do release que o referencia, evitando SHA autorreferente.
Usar os estados `NOT_RUN`, `FAILED`, `HOLD` ou `PROVEN` em cada capacidade. `PROVEN` exige
recibos dos casos e limites indicados; não significa que todo o runtime, CI ou domínio passou.

As demais sessões descobrem o release, fixam seu commit e usam a versão exata compatível.
Não editar silenciosamente a versão durante um caso ou julgamento. Publicar revisões e
reavaliar somente os bindings/provas afetados. Pré-requisito ausente mantém seu dependente
aberto; executar a fila independente e reler o release antes de concluir impossibilidade.

## O que cada evidência permite afirmar

| Evidência observada | Afirmação permitida | O que ainda exige prova |
| --- | --- | --- |
| Resposta nativa e corpo preservados | Produção efetiva daquela unidade. | Qualidade, importação, consumo. |
| Dois juízos locais vinculados | Aceite semântico do pacote exato. | Binding/runtime e gates pertinentes. |
| Adapter executado com pacote real | Operação de importação observada. | Publicação autorizada e leitura. |
| `ownership.index/read` reais | Índice/leitura da seleção observada. | Casos do consumidor e cobertura. |
| Casos de reuse/rebuild/recovery | Controles executados naquele candidato. | Outros controles/versões. |
| Testes remotos identificados | Resultado daqueles gates de CI. | Aceite semântico ou proteção da branch. |

## Binding, atualização e consumo

O adapter calcula hashes CAS e versões de inputs reais; hashes de transporte não são
`OwnershipInput.version`. Preservar bytes exatos. Dependência de build invalida resultados;
link de navegação só orienta consulta. Igualdade de prosa não iguala autoridade/validade/gaps.
Fontes indisponíveis permanecem indisponíveis; lista vazia não prova ausência de afetados. [R2, R3]

Juízes de conteúdo não emitem automaticamente aprovação de binding. Quando exigida, o
mesmo par independente recebe a transformação/candidato exatos e a evidência de execução
para decidir essa obrigação separada. Não sintetizar votos nem atribuir IDs históricos.

Consumidores independentes usam index/read reais e os limites fixados antes de avaliar.
Preservar consultas, respostas, versões e isolamento observado; abrir um arquivo diretamente
não prova consumo Atlas. Política, store ou projeção ausentes são precondições explícitas.
Testar publicação/recuperação somente em estado isolado autorizado, com geração coerente,
HOLD, retomada durável e rollback compatível. Não ativar produção como efeito colateral.

## Economia, CI e encerramento

Registrar plano finito local, tentativas e resultados; incluir juízes, correções e consumidores.
Continuar lotes autorizados até fechar a fatia; nenhuma quota histórica libera ou bloqueia
esta sessão nova. Tokens, tentativas físicas e cobrança não expostos são `UNKNOWN`, nunca zero.
Um ledger de tarefas não prova garantia financeira do adapter; preservar esse limite em AC-08.
Não usar provedores pagos externos nem executar retry incerto sem buscar o resultado anterior.

Seguir `AGENTS.md`: testes de produto em GitHub Actions, salvo autorização explícita do dono.
Não contornar guardas; build local não é CI. Inspecionar ferramentas disponíveis e rotas
permitidas antes de declarar dispatch impossível. Falta de um gate não paralisa produção
nativa, mas também não permite fechar a obrigação que o exige.

Aplicar [completion.md](completion.md): todos os itens próprios, dois juízos, correções,
consumidores e gates exigidos precisam de evidência antes de `DELIVERY_COMPLETE`. Uma
barreira externa demonstrada permanece incompleta, após executar todo trabalho independente.

## Fontes fixadas

- [R1: piloto](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/modules/atlas/scripts/ownership-pilot.ts), blob `6d560596653d640b86f1f0111119340d47dce689`.
- [R2: tipos](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/modules/atlas/packages/knowledge/src/ownership/types.ts), blob `05cb2ae05d296764ce2e786d07b28b36d7428cb7`.
- [R3: observação de inputs](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/modules/atlas/packages/adapter-io/src/ownership-input.ts), blob `c6afd6a35071a2487a1168cea5ed1ad26379c376`.
