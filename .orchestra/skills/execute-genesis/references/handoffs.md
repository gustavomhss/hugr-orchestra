# Entrega verificável de cada fatia

Aplicar à campanha lógica `20261111-v1`, protocolo `parallel-v3-fresh` e resultados
`20261111-v3-fresh`. Cada sessão tem atribuição explícita e branch `genesis-fresh-sN`.
Escrever sob `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/sN/`.
ROOT recebe as cinco entregas e integra em `genesis-fresh-final`, sob o prefixo
`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/integration/`.

## Pacote pequeno, conteúdo completo

Usar os arquivos abaixo; não criar documentos repetidos apenas para preencher categorias.

| Arquivo | Conteúdo necessário |
| --- | --- |
| `work.md` | Identidade da execução, escopo/necessidades, fila inteira, decisões, critérios e bloqueios |
| `execution-ledger.jsonl` | Despachos/IDs reais, respostas, estados, uso observado e incertezas |
| `native-package.json` | Índice dos artefatos reais, fontes, dependências, corpos/paths e hashes |
| `judgments/` | Pedidos e decisões originais dos dois juízes, correções e reavaliações vinculadas |
| `handoff.json` | Resumo final ou checkpoint com referências imutáveis e estado verdadeiro |

Os corpos produzidos, código necessário, pedidos/respostas visíveis e recibos de
execução pertencem ao pacote, nos caminhos referidos. Um índice não substitui esses
conteúdos. Reutilizar o mesmo `work.md` para a fila e a auditoria de conclusão.
Usar axiomas, invariantes, qualidade e critérios normativos para orientar e verificar
o trabalho; não produzir um arquivo separado para cada ID. Evidência já registrada
pode sustentar vários critérios quando a relação for explícita e correta.

## Identidades que não se confundem

- `source_revision`: baseline investigado, `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- `protocol_revision`: commit imutável da skill carregada.
- `observed_branch_head`: HEAD lido antes da publicação, usado no lease.
- `candidate_revision`: commit da implementação realmente executada; `null` se ainda ausente.
- `artifact_revision`: commit contendo os bytes entregues, conhecido depois de criá-lo.

Fontes alteradas e dependências externas recebem bindings próprios. Um checkout no
commit do kit não tem HEAD igual ao baseline; registrar ambos sem falsificar Git.
Cada referência externa informa commit completo, caminho e SHA-256 dos bytes.
Dentro de `native-package.json`, caminhos locais resolvem no `artifact_revision`
informado pelo handoff. Não inserir o hash do próprio manifesto dentro dele.

## Publicar sem autorreferência ou corrida

1. Ler o HEAD atual `B` da própria branch. Confirmar a execução e reconciliar
   trabalho novo antes de montar mudanças; nunca resetar para o commit do kit.
2. Congelar os corpos e seus hashes, índice, decisões, fila e ledger. Criar o commit
   de payload `P`, descendente de `B`, contendo esses arquivos.
3. Criar a selagem `H`, descendente de `P`, com `handoff.json`. Nele,
   `artifact_revision` aponta para `P`, já existente; o handoff não contém o SHA de `H`.
4. Atualizar a própria branch de `B` para `H`, com `expected_sha=B` e `force: false`.
   Se o lease falhar, reler e reconciliar. Não forçar nem sobrescrever outro escritor.
5. Reler em `H` o handoff e os arquivos referidos em `P`, conferindo hashes.
   Informar `H` e a URL na resposta. Um recibo posterior pode apontar para `H`;
   não reescrever a selagem para inserir seu próprio SHA.

`B`, `P` e `H` são nomes explicativos, nunca valores de uma evidência real. A criação
de objetos Git sem atualizar/verificar a branch não comprova entrega acessível.
A orquestradora faz as escritas remotas pelo conector; ver [fresh-start.md](fresh-start.md).

## Exemplo de handoff a preencher, não resultado executado

```json
{
  "campaign": "20261111-v1",
  "protocol_epoch": "parallel-v3-fresh",
  "results_epoch": "20261111-v3-fresh",
  "session": "sN",
  "execution_id": "<UUID local desta execucao>",
  "branch": "genesis-fresh-sN",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "protocol_revision": "<SHA40 do protocolo>",
  "candidate_revision": null,
  "artifact_revision": "<SHA40 do payload P ja criado>",
  "package": {"path": "<prefixo da sessao>/native-package.json", "sha256": "<SHA256>"},
  "work": "<prefixo da sessao>/work.md",
  "ledger": "<prefixo da sessao>/execution-ledger.jsonl",
  "judgments": [],
  "completion_state": "IN_PROGRESS",
  "local_obligations_open": [],
  "global_integration": {"owner": "root", "status": "NOT_REVIEWED"},
  "consumed_dependencies": [],
  "supersedes": null
}
```

Campos vazios não são aprovação. Preencher decisões e obrigações reais; `supersedes`
referencia a selagem anterior quando houver. Os dois juízos precisam cobrir a mesma
versão efetivamente entregue, com todos os findings obrigatórios resolvidos.

## Conclusão local e integração global

`DELIVERY_COMPLETE` exige toda a fatia produzida, conferida, julgada pelos dois,
corrigida/reavaliada, com consumidores e verificações locais aplicáveis executados,
fila fechada e Git confirmado. Aplicar [completion.md](completion.md).
Plano, checkpoint, proposta, delegação ou PASS semântico isolado não satisfazem isso.
Separar a obrigação local de seu complemento global. A integração de ROOT não absorve
produção, consumidores, correções ou gates locais ainda faltantes.

Se falta prova dependente do runtime de S4, consultar `genesis-fresh-s4` e seu
`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json`.
Fixar os bytes, commit e candidato da versão efetivamente usada; não seguir um HEAD
móvel durante avaliação. Continuar todos os itens independentes enquanto faltar a dependência.
Impedimento material demonstrado fica `INCOMPLETE_BLOCKED`, com operação, evidência,
itens abertos e condição de desbloqueio. Não convertê-lo em conclusão ou `NOT_APPLICABLE`.

O ledger atual e os segmentos históricos mantêm identidades distintas; ROOT reconcilia
o agregado, sem tornar essa reconciliação condição inicial das fatias novas.
Aceite global, aceite humano, landing e ativação são estados próprios. A resposta final
informa commit/URL, cobertura, dois juízos, correções, execução real e pendências exatas.
