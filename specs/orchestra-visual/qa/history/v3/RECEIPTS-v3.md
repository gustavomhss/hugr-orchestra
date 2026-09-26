# RECEIPTS v3 — protocolo para o executor

## O que é obrigatório

O schema do recibo é **2**. O schema do progresso continua **1**. Gere recibos novos usando `receipt_template.py`; nunca troque apenas o número do schema de uma prova antiga. O template não libera trabalho.

| Campo | Contrato |
|---|---|
| id | ID de task existente; não ID de épico/issue/WP |
| head | SHA Git completo do código efetivamente verificado |
| contract_sha256 | Digest calculado pelo template sobre o contrato atual da task |
| paths_changed | Caminhos relativos ao repositório, dentro de write_paths e fora de exclude_paths; array vazio permitido para verificação sem escrita de produto |
| axioms | Cinco grupos exatos, todos criterion_ids uma vez, cada resultado sustentado por arquivos de prova |
| artifacts | Dicionário caminho-relativo-à-raiz-do-pacote → SHA-256 dos bytes da prova |
| commands | Comando, cwd, exit_code inteiro e log; ao menos um comando positivo aprovado |
| review | status, head, method e arquivo de revisão; distinguir self-cold-review de independent-agent e human |
| performance / visual / native | Três decisões explícitas; required exige PASS, scoped admite NOT_APPLICABLE com justificativa estreita |

Estados de progresso continuam PENDING, RUNNING, PASS, FAIL, STALE, BLOCKED_EXTERNAL. Um recibo só autoriza PASS após verificações reais. FAIL/NOT_RUN são resultados documentáveis, mas o validador de conclusão os reprova. Falta de hardware não torna teste nativo “inaplicável” em uma task que exige Electron.

## Passo a passo

```sh
python3 tools/receipt_template.py S17-W1-T2 --out evidence/S17/W1-T2.draft.json
# Executar a task; registrar dados reais e abrir todas as provas.
# Preencher o draft. Não marcar PASS antes da execução/revisão.
python3 tools/seal_receipt.py evidence/S17/W1-T2.draft.json --out evidence/S17/W1-T2.json
python3 tools/validate_evidence.py S17-W1-T2 evidence/S17/W1-T2.json
python3 tools/select_work.py --repo /caminho/real/HuGR-Orchestra --jobs 4
```

`seal_receipt` calcula integridade, não certifica autenticidade e não muda nenhum status. Não atualiza progress.json. Não copie recibos sintéticos dos testes como evidência de produto. Provas, recibo e revisão devem ser recuperáveis sem depender de memória de outra sessão.

## Categorias PASS

Cada categoria PASS informa o mesmo `head` do recibo, um `build_sha256` de 64 caracteres hexadecimais e `known_defects: []`. Categorias avaliadas juntas referenciam o mesmo build. Não fabricar um hash constante: calcular o digest do manifesto dos artefatos realmente testados.

Visual contém `screenshots` (arquivos PNG) e `review_file`. O validador confere cabeçalho/dimensões e hash, não julga pixels, layout ou beleza. O executor precisa abrir os PNGs, comparar master, estados e geometria e registrar desvios no review_file.

Performance contém `metrics_file`, um JSON com `kind: performance-evaluation`, `status`, `head`, `build_sha256`, `environment` e `gates`. Native usa `report_file` e `kind: native-evaluation`, com os mesmos campos. Cada gate contém `id`, `status` e array `evidence`. Todos os IDs exigidos em `required_performance_gates` / `required_native_gates` precisam aparecer e passar; IDs não substituem resultados brutos. Todas as provas dos gates também entram em artifacts.

Não existe exemplo de PASS pré-preenchido neste guia. Os testes unitários usam relatórios sintéticos explicitamente identificados apenas para provar o comportamento dos validadores.

## Comandos negativos

Um controle negativo usa `expected_failure: true` (booleano), `negative_control` não vazio, exit_code inteiro não zero e log. Ele não substitui um teste positivo: precisa haver pelo menos um comando positivo com saída zero. Uma falha real não vira controle negativo por renomear seu campo.

## Contrato, fonte e artefatos alterados

Mudança de critérios, steps, caminhos, dependências, gates ou locks altera o digest do contrato da task. Reavaliar; não reescrever o digest à mão para reaproveitar PASS. Alteração nos bytes de uma prova invalida seu inventário. Mudança no código relevante invalida o resultado no seletor com `--repo`.

`--repo` usa Git somente para leitura: ancestry, changed files e dirty/untracked. Não faz reset, stash, checkout ou escrita. A gravação dos próprios recibos e de progress.json não é mudança de produto; a integridade desses arquivos/provas permanece verificável. Mapas, fixtures, fonte, contratos e DELIVERY.md não são excluídos genericamente.

Sem `--repo`, a saída é uma verificação offline do plano/recibos, com `source_revision_verified: false`; não prova atualidade do checkout. Mesmo com `--repo`, cones declarados não fazem análise automática completa do grafo de imports. Revisão de escopo e gates integrados continuam obrigatórios.

## Independência da revisão

`self-cold-review` significa nova leitura do autor, não revisão por outra pessoa ou agente. Use `independent-agent` somente quando um executor separado realmente revisar; use `human` somente para revisão humana. A ferramenta valida o campo, mas não verifica identidade/autenticidade do revisor. Não chamar reexecução de script de revisão visual independente.
