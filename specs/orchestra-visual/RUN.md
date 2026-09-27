# EXECUTOR — iniciar ou retomar em três comandos

Épico: [#215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215). Insumos na branch `visual-migration-plan`, pasta `specs/orchestra-visual/`. Sem os insumos no checkout, siga [START-HERE.md](START-HERE.md); não resete nem substitua seu código para obter documentos. Leia AGENTS.md antes de escrever.

```sh
# CWD inicial: dentro do checkout/worktree correto do Orchestra.
REPO="$(git rev-parse --show-toplevel)" || exit 1
PLAN_ROOT="$REPO/specs/orchestra-visual"
cd "$PLAN_ROOT" || exit 1

# 1. Observe ambiente, identidade, dirty state e versões. Não instala nada.
python3 tools/executor.py doctor --repo "$REPO"

# 2. Veja trabalho registrado, próxima seleção e motivos dos bloqueios.
python3 tools/executor.py resume --repo "$REPO" --jobs 4

# 3. Gere o contexto da task selecionada. S01 é a primeira apenas no estado inicial.
python3 tools/executor.py packet S01-W1-T1 --repo "$REPO"
```

`packet` inclui a task inteira, os cinco axiomas de todos os ancestrais com seus estágios, escopos, dependências, instruções locais, comandos descobertos nos manifests dos packages e as seções literais Wxx atribuídas. Os demais contratos normativos aparecem por arquivo, hash e índice de linhas; não são dispensados nem resumidos por um modelo. Abra também o mock real. O pacote é uma vista descartável das fontes, não outro plano.

Para guardar um pacote, acrescente `--out CAMINHO_NOVO.md`. A pasta precisa existir; arquivo existente nunca é sobrescrito. Sem `--out`, a saída vai ao terminal. Não versionar dezenas de pacotes estáticos nem reusar um pacote depois de mudar código/contrato/progresso: gere novamente.

## Ler o resultado corretamente

| Resultado | Significado |
|---|---|
| `doctor: OBSERVED` | Observação realizada; não aprova build, dependências ou hardware. Bun ausente/diferente e node_modules ausente são explícitos. S01 pode fazer descoberta sem instalar Bun. |
| `SELECTED_BY_EXISTING_POLICY` | A task foi selecionada pelo seletor existente nessa fotografia; o coordenador ainda precisa registrar RUNNING e respeitar concorrência. |
| `PREPARATION_OR_RESUME_ONLY` | Pode ler; não significa que uma task bloqueada pode começar. Confira os motivos e o progresso atual. |
| `invalid_claims`, `external_errors`, `REPAIR_REQUIRED` | Reparar as provas/entradas apontadas; não fabricar PASS. |
| Exit 1 | Entrada/operação inválida. Nenhuma autorização de execução. |
| Exit 2 | Há provas inválidas/pendências de fonte ou requisito do tooling; interpretar JSON, não apenas exit code. |

A ferramenta não instala dependências, não chama modelos, não cria worktrees, não executa scripts de package, não adquire locks nem escreve progress/recibos aprovados. Descobrir um script no package.json não o torna seguro nem comprova que ele roda. O único subprocesso fora das leituras Git é `bun --version`, quando disponível. Um Git shallow sem o objeto-base é informado; a ferramenta não faz fetch para escondê-lo.

## Depois do pacote

Execute a rotina de tentativa que ele mostra: baseline **antes da escrita**, implementação no scope, verificações proporcionais, recibo e revisão. As ferramentas existentes continuam sendo `capture_scope.py`, `receipt_template.py`, `seal_receipt.py`, `validate_evidence.py` e `select_work.py`. Coordenador único atualiza progress; o helper não altera a política nem concede exceção aos cinco axiomas.

Comandos de produto rodam no package indicado, nunca testes na raiz do monorepo. S02 ainda implementa fixtures/coletores reais; o helper não inventa um comando de screenshot já pronto. Para uma tarefa sem código de produto, ausência de um comando de build na lista é esperada.

Retomada: rode `resume` e gere o pacote da task em andamento. A vista usa Git + progress + os validadores existentes. Ela não adivinha uma próxima edição a partir da última mensagem do chat ou do título de um commit.

## Limites desta entrega

Esta camada facilita descoberta/contexto/retomada. Não implementa um coletor genérico de comandos, não copia toda a especificação em cada subagente e não executa automaticamente o aplicativo. O ensaio de publicação usa checkout real do GitHub para doctor, seleção, pacote, baseline e template NOT_RUN; não conclui S01, não mede o Mac e não prova frontend ou Electron. Resultados efetivos: [reviews/executor-aids/REPORT.json](reviews/executor-aids/REPORT.json).
