# S2-U1 — plano concreto proposto, não executado

## Escopo e ordem

Executar somente depois da primeira travessia e dos 14 casos congelados. Este trabalho preparou um plano estático e um arquivo de patch; não alterou fonte, oráculo, perguntas, raiz ou runtime. Não produziu conhecimento novo nem votos.

## Patch preciso

Na linha 18 de `apps/desktop/src/main/owned-serve.ts`, substituir uma única ocorrência:

```diff
-const READY_TIMEOUT = 120_000
+const READY_TIMEOUT = 150_000
```

Baseline: revisão `1cde2ff7a71bcf7aecb5d030917b577165135d38`, 8.511 bytes, blob `31d70c15aafdc91ebccc1c5cd25da153cfac84ed`, SHA-256 `0970f4ddb99c1c004e200443abc54ed5ea38cec098e19ef9aa748b771238dfb5`.

A variante prospectiva tem o mesmo tamanho e SHA-256 `9e1d1a2b77d329251082352b6e66d7f8e9cccd0d339a534999714b9f2f6dcb08`. Esse hash foi calculado em memória; a variante não foi aplicada. A versão Atlas nova será produzida pelo runtime na operação real.

Consequência pretendida: o limite de espera de um filho vivo que não responde passa de 120 para 150 segundos, e a mensagem interpolada passa a mencionar 150000 ms. A saída precoce continua concorrendo como falha imediata. Stop, backoff, poll, autenticação e configuração remota ficam intactos. Isso é expectativa derivada da fonte, não teste executado do desktop.

## Grafo congelado reconciliado

O oráculo mantém SHA-256 `716f9f06506a34556ec8b56978048f5e31b401d43aae1bdeb0fdd2de476c954f`. A comparação estática com o candidato v2 atual confirmou 32 arestas de build e 30 de navegação.

| Grupo | Artefatos |
| --- | --- |
| Dois diretos | `s2.l1.desktop-web`, `s2.l2.desktop-web` |
| Nove no alcance de build | Os dois diretos; os três L3; os quatro L4 |
| Quatro fora | `s2.l1.app-session`, `s2.l1.design-tui`, `s2.l2.app-session`, `s2.l2.design-tui` |
| Frontier prevista | Somente `s2.l1.desktop-web`; L2 é direto, mas já depende de L1 afetado |

A ordem prevista é L1 desktop/web → L2 desktop/web → L3 app-session/design-tui/desktop-web → L4 app-session/design-tui/desktop-web/entry. Comparar o conjunto real e registrar a ordem efetiva; nunca passar esse conjunto ao runtime como resultado pronto.

## Plano de fase e raízes

`prepareEvaluationUpdate` copia `originalPlan.maintenance`, consumidores e limites. Seu request não possui campo para instalar um plano de manutenção novo. A fase inicial exclui manutenção. Acrescentar uma operação na policy não documenta, por si, o novo escopo.

A rota conservadora proposta, usando APIs existentes, é criar depois dos 14 casos um baseline de manutenção M0 separado, com pacote e obrigação original preservados, plano concreto, driver fixado e novos votos ADMIT. R1 fica intacto. Isso é uma escolha de plano, não uma afirmação de que novo baseline seja obrigatório para toda solução possível. Outra ligação do plano concreto à linhagem precisa ser comprovada e aceita em revisão posterior.

Raízes propostas, ainda não criadas: `s2-u1-baseline` (M0), `s2-u1-changed` (M1) e `s2-u1-restored` (M2), todas irmãs sob o scratch atual. Não copiar policy, projeção, marcador ou estado ativo. CAS copiado precisa de bytes próprios verificados, sem hardlinks/symlinks.

Antes de M0, fixar os IDs e orçamentos finitos das sondas U1, separadamente do deck original; plano, driver, receitas, hashes, autoridade, gerações, pontos de parada e formatos de recibos. Nenhum ID, orçamento ou geração inexistente foi inventado neste plano.

## Sequência concreta

1. **Baseline e reuse.** Admitir M0 com fonte original e plano de manutenção. Salvar manifest, generation e bindings dos 13 artefatos. `prepareEvaluationUpdate` com inputs/receitas idênticos e mesma raiz deve devolver `evaluation-reuse`, candidato/manifest originais e zero calls. O request exige uma geração proposta diferente, ainda que o resultado seja reuse.
2. **Drift e alcance.** Aplicar somente o patch na materialização descartável de manutenção. O planner real deve encontrar os dois diretos, nove afetados e quatro fora. Se a raiz admitida for deliberadamente alterada para a sonda de drift, seu leitor composto deve recusar a seleção atual.
3. **Target alterado.** Capturar fontes completas para M1. Produções nativas reais devem receber as capturas e resultados das dependências corretos. Preservar respostas e evidência semântica nova por resultado alterado. Executar o prepare v2 de update, obter o candidato completo, submeter os dois votos ADMIT novos e finalizar a estrutura privada.
4. **Parada e retomada.** Parar deliberadamente após persistir candidato, CAS, decisões e finalização privada, antes de inicializar/admitir. Reiniciar o processo, verificar todos os bytes/identidades e continuar sem nova produção nem novo callback de recipe.
5. **Admissão e leitura.** Inicializar M1 fresco, provisionar autoridade real e executar `admit-target`. Usar o manifest efetivamente devolvido pela admissão para index/read. A leitura atual deve refletir 150 segundos e as identidades de M1.
6. **Restauração e rebind.** Repor os 8.511 bytes originais em cópia de manutenção. O candidato alterado, se agora estiver em drift, deve servir HOLD. Preparar M2 contra o baseline alterado, obter evidência semântica e votos novos e admitir em raiz fresca. A leitura atual deve refletir 120 segundos. Não trocar silenciosamente para um manifest antigo.
7. **Controles negativos.** Em capturas descartáveis separadas: retirar uma fonte obrigatória; omitir uma aresta required; fornecer recipeVersion antiga; variar receita/result metadata declaradamente; produzir validade blocked. Registrar recusas e contagens reais. Reutilizar controles comuns compatíveis com escopo explícito; não alegar nova execução de S2 a partir deles.
8. **Reuse final e auditoria.** Repetir inputs/receitas idênticos no M2 admitido e reiniciar o leitor. Exigir zero calls no reuse e leitura atual válida. Conferir preservação de R1, oráculos, perguntas, grafo e bindings fora do alcance.

Restaurar fonte exata não garante que um produtor nativo recrie prosa byte a byte. Comparar resultados efetivos e exigir rebind correto; igualdade com um hash histórico só pode ser afirmada se os bytes e metadados realmente coincidirem.

## Dois detalhes que mudam os observáveis

**O leitor composto verifica todas as observações do candidato.** `evaluationManifestRefusal` devolve `evaluation-input-drift` se qualquer observação divergir. Portanto, consultas aos quatro artefatos fora do alcance também podem receber HOLD durante drift. O oráculo exige que eles não sejam reconstruídos, não disponibilidade parcial do candidato incoerente.

Nos quatro fora, comparar `result`, `inputs`, `inputs_id`, dependências e ausência de chamadas. Não exigir contratos, receipts, artifact IDs e manifest iguais: o novo plano/candidato/geração muda os envelopes v2 de todas as 13 entradas.

Além disso, o manifest privado de `finalizeEvaluationUpdate` pode diferir do manifest posteriormente emitido por `admit-target`, porque as strings de proveniência dos reviews são diferentes. Comparar candidato, generation e mappings; consumir o manifest realmente admitido.

## Receitas e chamadas reais

As 13 `recipe_ref` originais estão vinculadas aos inputs dos receipts. O registro exato está em `static-reconciliation.json`: recipeInputKey, recipeVersion, declaredInputs, mandatoryInputs e required.

Essas receitas são prompts nativos. O driver novo não herda sua identidade executável apenas por apontar para esses prompts. Fixar separadamente os bytes do driver no plano revisado.

`OwnershipRecipe.run` é síncrona. Não se pode fingir que ela aguarda um despacho de subagente. A integração ainda necessária deve preservar produções nativas reais previamente realizadas sobre capturas exatas, e fazer o callback materializar somente a saída selada que corresponde àquela combinação de input/dependency/recipe. Snapshot sem saída correspondente deve recusar.

Contar separadamente:

- Alcance estático e alcance retornado pelo planner: nove na alteração principal.
- Tentativas e retornos de callbacks `recipe.run`, por chave e ordem.
- Despachos/respostas reais dos produtores nativos.
- Materializações/replays de saídas já persistidas.
- Reviews semânticos, votos ADMIT, leituras e tentativas de retomada.

O produto decide o callback por mudança de input ou **result ID** de dependência. Descendentes alcançáveis podem não executar se os resultados necessários não mudarem. Não antecipar “nove interpretações”. O array `calls` é preenchido depois do retorno da recipe; uma falha pode perder a contagem parcial no resultado HOLD. O driver precisa registrar entrada/saída duráveis, e HOLD não significa zero chamadas.

Mudança de autoridade/gaps pode mudar result ID com prosa igual. Validade blocked recusa. Um controle desses precisa de causa declarada e recipe/captura correspondente: trocar uma função escondida mantendo inputs idênticos não demonstra propagação. Não usar o corpo antigo de 120 segundos como resultado supported da fonte de 150 segundos.

## APIs e comandos reais

Código fixado: `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`. Oito fontes lidas foram comparadas com os blobs desse commit.

```ts
planOwnershipUpdate(store, manifestRef, scope, observe, context?)

prepareEvaluationUpdate({
  store, baseline, manifest, context, targetGeneration, targetRepoRoot,
  recipes, observe, readCapturedBytes, listMembers, semanticEvidence
})

finalizeEvaluationUpdate({
  store, target, binding, current, readReference
})

admitEvaluationRebuildTarget(repoPath, value, approvalPath)
```

`observe` deve usar a observação tri-state real; `readCapturedBytes` devolve os bytes retidos que geraram aquela versão, com checks reais antes/depois. Não reabrir fonte viva dentro da recipe, nem derivar absent de undefined. Não existem members: neste baseline; pedidos inesperados de membership devem recusar, não receber uma lista vazia inventada.

No CWD do runtime `modules/atlas`, existem:

```text
bun scripts/genesis-evaluation.ts prepare <root> <plan-relative> <new-prepared-file>
bun scripts/genesis-evaluation.ts init-store <root> <prepared-file> <generation>
bun scripts/genesis-evaluation.ts admit-target <root> <target-prepared-file> <approval-relative>
bun scripts/genesis-evaluation.ts index <root> <query-file>
bun scripts/genesis-evaluation.ts read <root> <query-file>
```

Não existe modo rebuild/finalize nesse CLI. O driver API ainda precisa ser escrito/revisado; apenas o formato de invocação necessário é proposto:

```text
bun <new-reviewed-u1-v2-driver.ts> <request.json>
```

O arquivo acima não existe e não foi executado. O driver deverá separar `target-update.json` (resultado completo do prepare para finalize) de `target-prepared.json` (somente schema/candidate_id/candidate para admit-target). O legado `maintenance-operation.mjs` chama rebuild v1, que recusa v2.

A admissão de target exige store fresco e recusa projeção existente. Resultado incerto deve ser recuperado pelos recibos/estado antes de outra tentativa; não tratar o comando como retry idempotente.

## Bloqueios materiais

Ainda faltam o término dos 14 casos, escopo de manutenção fixado e revisado, driver v2 e ponte de produção real, baseline/manifest/gerações/policies de manutenção e evidência nova para os targets. Esses são itens concretos, não resultados inferidos do grafo. A variante, os observáveis e as portas estão delimitados; nenhum passo U1 foi executado.

