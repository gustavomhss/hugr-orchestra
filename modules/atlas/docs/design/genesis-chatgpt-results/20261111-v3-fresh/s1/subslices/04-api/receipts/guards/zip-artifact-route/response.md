# Rota Actions para o ZIP histórico — resultado delimitado

A consulta solicitada foi recusada pelo conector, antes de retornar qualquer inventário:

`GET https://api.github.com/repos/gustavomhss/hugr-orchestra/actions/artifacts?name=source-captures`

Erro observado:

```text
HTTPError: 400: GitHub Fetch URL is not an allowed public GitHub repository or search endpoint. (Response: None)
error_code: INVALID_ARGUMENT
```

Isso não prova que o artefato inexista no GitHub. Prova que esta rota de inventário não foi aceita pelo transporte disponível. Nenhum artifact ID ou outra pista foi retornado.

O registry expõe `mcp__codex_apps__github_download_workflow_artifact`, que recebe `repo_full_name` e `artifact_id`, segue o redirect do download e devolve referência de arquivo ZIP. Sem um artefato identificado, a ferramenta de download não foi acionada. A existência dessa capacidade não permitiu obter os bytes desejados nesta tentativa.

Não houve crawl, tentativa em outro canal de I/O, nova CI, dispatch, teste, guard, policy ou escrita no checkout verificado. O alvo continua sem bytes comprovados: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/evidence/source-captures.zip`, 1.339.105 bytes, Git blob `d83941a9d836a23e466ca09ecba1f21d423094cb`.

Pedido preservado em `request.txt`, request/response integral em `query-capture.json` e resultado estruturado em `receipt.json`, todos no diretório `s1-04-runtime-scout/guard-zip-artifact-route`.
