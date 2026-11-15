## REQUEST_EVIDENCE — automation-3-supplement-v3

**J1 — execução `34269cf4-d631-41c5-a30b-85b0ec217390`.** Julgamento de **§§6–9**, intervalo UTF-8 **`[30198,48200)`**, do corpo v3 de **60.588 bytes**, SHA256 **`b31d52e5bf25f6eca3807e9c1f418b70d865c9d63c5690125c530c54f8247d84`**.

Os três deltas apresentados resolvem as generalizações anteriores sobre **scoped-green**, **repetição de dispatch após rows em `error`** e **classificação de custos por `spend.card`**. Resta uma questão concreta de fidelidade do transporte que impede fechar este lote.

### Evidência exata ainda necessária — AUT3-C04

Na parte 3/8, a função `endOf`, de `packages/core/src/board/shared.ts`, foi recebida com esta assinatura:

```typescript
export const endOf = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID, stage: Board.Stage) {
```

Entretanto, seu filtro foi transportado como:

```typescript
.where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.stage, stage)))
```

Os chamadores fornecidos em **AUT3-C01, C08, C17 e C20** passam o próprio identificador, por exemplo `endOf(tx, project.id, stage)`. A tabela em **AUT3-C05** armazena esse identificador em uma coluna textual. Portanto, a leitura de `project.id` dentro de `endOf` diverge da assinatura e dos chamadores recebidos.

**Pedido limitado:** confirmar literalmente a assinatura e o `where` de `endOf` no commit e na identidade já declarados para AUT3-C04 — SHA256 **`7372c16b39f3077dddddfdfec7555bd5008cd489c90ce3546126fc38289ae2de`**. Se houve alteração na transcrição, fornecer a correção exclusiva de transporte, preservando o envio original. Se esses forem realmente os bytes canônicos, será necessário avaliar a limitação correspondente no relato do mecanismo; não presumo uma correção do produto.

### Disposição das pendências

| Pedido | Disposição |
| --- | --- |
| **RE-AUT3-01** | **Aberto somente quanto à divergência de `endOf`**, que afeta a evidência da atribuição de posição por projeto e estágio. Os demais pontos solicitados estão sustentados. |
| **RE-AUT3-02** | **Encerrado**, incluindo o delta de custos. |
| **RE-AUT3-03** | **Encerrado**, incluindo os dois deltas sobre estado scoped e dispatch de workflows. |
| **RE-AUT3-04** | **Aberto somente quanto ao mesmo helper compartilhado**, utilizado nas movimentações da fila; os demais pontos solicitados estão sustentados. |
| **RE-AUT3-05** | **Encerrado.** |
| **RE-AUT3-06** | **Encerrado.** |

A pendência aplica a barra já existente de fidelidade e suficiência da evidência; não acrescenta exigência de execução ou testes. **Não há PASS de §§6–9 nesta resposta.** Permanecem preservados os aceites anteriores de automation-1/2 e as pendências de automation-4; o corpo integral de automation continua sem aceite.