# Iniciar uma fatia em conversa nova

O prompt de abertura fixa seu número S1–S5 e seu domínio. Não escolher outra fatia,
deduzir o número de conversas anteriores nem executar o trabalho de outra sessão.
Aplicar a skill e sua fatia no commit imutável indicado pelo prompt.

| Campo | Valor |
| --- | --- |
| Repositório | `gustavomhss/hugr-orchestra` |
| `start_mode` / `history_required` | `fresh_chat` / `false` |
| Campanha lógica | `20261111-v1` |
| Protocolo / resultados | `parallel-v3-fresh` / `20261111-v3-fresh` |
| Fonte de investigação | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Branch própria | `genesis-fresh-sN`, com N fixado no prompt |
| Prefixo próprio | `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/sN/` |
| Integração final | ROOT, na conversa original; branch `genesis-fresh-final` |

## Bootstrap curto e produtivo

1. Ler `AGENTS.md`, a skill e o contrato da fatia no pin informado. Usar a partição
   pronta; começar pelas fontes necessárias ao primeiro trabalho concreto.
2. Descobrir GitHub, execução isolada e subagentes disponíveis. Não presumir handles,
   filesystem, dependências ou capacidades vistos em outra conversa.
3. Pelo conector GitHub, conferir a branch própria. Se ausente, criá-la no commit
   do protocolo. ROOT pode tê-la precriado no commit final do kit: aceitar esse HEAD
   sem claim somente se descender do protocolo e suas diferenças forem limitadas
   ao kit, com fonte de produto idêntica ao baseline. Registrar o HEAD observado.
4. Registrar em `work.md` seu número, domínio, fonte, protocolo, HEAD observado e
   `execution_id` gerado localmente, por exemplo um UUID. Esse ID identifica esta
   execução; não apresentá-lo como um ID de conversa ou agente fornecido pelo host.
5. Se já existe registro de execução na branch, retomar somente sua execução
   identificada. Outra execução ocupando a mesma fatia exige resolver a colisão;
   não resetar, sobrescrever, duplicar despachos ou escolher outra branch por conta própria.
6. Publicar o registro inicial com atualização condicional de HEAD. Definir a fila
   finita em `work.md`, com outputs e critérios suficientes para atribuir tarefas.
   A fila deve cobrir a fatia inteira; detalhar os próximos lotes durante o trabalho.
7. Despachar um produtor para uma unidade útil, recolher seu artefato e prosseguir
   com [orquestração](orchestration.md). Bootstrap e plano não encerram a tarefa.

Não exigir migração, handoff antigo, orçamento da S1 ou aprovação de ROOT para iniciar.
Consultar uma fonte histórica somente quando ela ajudar uma tarefa concreta. A falta
de resultado de uma conversa antiga não prova término ou autoriza repetir sua chamada.

## Isolamento e papéis

A orquestradora é a única escritora remota de sua branch. Subagentes produtores
escrevem em áreas locais exclusivas e entregam arquivos/diffs para ela conferir.
Isolar checkout/candidato, corpus, CAS, store e projeção por execução. Nunca supor que
um diretório de outro chat é seu ou modificar o candidato de outra sessão.
Criar juízes novos, com contexto limpo, quando existir o primeiro pacote julgável.
Registrar os `agent_id` realmente retornados; usar o mesmo par nos deltas desta sessão.
Rosters antigos são história, não identidades chamáveis. Ver [julgamento](judging.md).

## GitHub pelo conector

Descobrir os schemas reais das ferramentas; os nomes abaixo indicam suas operações.
Usar leitura de ref/commit para obter HEAD e tree, `create_branch` para criação,
`create_tree` e `create_commit` para conteúdo, e `update_ref` com `expected_sha` e
`force: false` para publicação. `compare_commits` da branch contra ela mesma também
expõe seu SHA em `base_commit.sha` quando essa operação estiver disponível.
Reler os arquivos no commit publicado e conferir os hashes. A sequência de payload
e selagem está em [handoffs.md](handoffs.md); não inventar o SHA do próprio commit.
Não usar `gh`, fazer login, preencher `GH_TOKEN` ou procurar credenciais. O shell
não herda automaticamente a autenticação do conector. Não alterar branches alheias.

## História, uso e dependências

O ledger novo registra os despachos desta execução, incluindo juízes, correções e
consumidores. Preservar os segmentos históricos sem zerar reservas ou custo; ROOT
reconcilia o agregado. Marcar o histórico não reconciliado como tal, sem torná-lo
uma barreira inicial. Tokens, tentativas físicas e cobrança não expostos são `UNKNOWN`.

Quando precisar do runtime comum, consultar `genesis-fresh-s4` no caminho fixo
`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json`.
Fixar commit e hash da versão consumida, além do candidato que ela identifica.
Uma referência ainda ausente retém somente sua prova dependente; continuar produção,
revisão e correções independentes. Só concluir conforme [completion.md](completion.md).
