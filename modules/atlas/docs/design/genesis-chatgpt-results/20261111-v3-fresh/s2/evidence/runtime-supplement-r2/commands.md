# Plano concreto de prepare — full13, não executado

**Estado: HOLD.** O pacote ainda contém apenas 3 dos 13 artefatos e r1 não suporta três inputs necessários. Este documento não autoriza execução.

## Identidades e caminhos

- Fonte: `/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/source-root`
- CWD do candidato r1: `/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/runtime-code/modules/atlas`
- Bun isolado: `/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/tools/bun-package/bin/bun`
- Pacote relativo à fonte: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/native-package.json`
- Nova saída proposta: `/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/outputs/s2-full13-prepared-v1.json`
- Estado que prepare escreverá: `/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/source-root/.atlas/cas`

## Trabalho já executado

```bash
# CWD: runtime-work/runtime-code/modules/atlas
node scripts/fix-scip-types.mjs

# CWD: runtime-work/runtime-code/modules/atlas/packages/adapter-io
/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/tools/bun-package/bin/bun run typecheck
```

Ambos terminaram com exit code 0. Foram build/typecheck; não foram testes de produto.

## Preconditions para a futura execução completa

1. Finalizar e aceitar os 13 artefatos. Usar o manifesto final para resolver body.path, receitas, pedidos, respostas, decisões e demais referências, sem preencher os dez artefatos hoje ausentes com valores presumidos.
2. Obter release S4 compatível com `schema/tui.json` (1.131.057 bytes), `inputs/app-session-tree.json` (369.462) e `inputs/design-tui-tree.json` (390.775). Conferir seu entrypoint e materializar outro candidato isolado; preservar a cópia r1.
3. Materializar todos os arquivos listados pelo manifesto final sob a fonte. `prepare-plan.json` fornece os 610 caminhos conhecidos do snapshot atual, incluindo protocolo, três corpos L1, receitas originais/correção e os três snapshots de população. Principal deve tratar oracle e revisões sem expor conteúdo a este trabalhador.
4. Reconciliar hashes exatos; confirmar que required/missing/roots/dependências e pareceres satisfazem o pacote completo. Os snapshots de população permanecem arquivos `file:`; não criar HEAD ou observação `members:` fictícios.
5. Confirmar diretório da saída existente e arquivo da saída ausente. Obter instrução posterior para executar `prepare`.

## Sintaxe exata documentada no candidato atual

```bash
cd /workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/runtime-code/modules/atlas

/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/tools/bun-package/bin/bun \
  scripts/genesis-native.ts \
  prepare \
  /workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/source-root \
  modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/native-package.json \
  /workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/outputs/s2-full13-prepared-v1.json
```

**Não executar esse comando em r1 para full13.** Ele documenta os argumentos reais e os caminhos concretos; os três arquivos grandes excedem a capacidade atual. Quando existir revisão compatível, reconferir o entrypoint e usar o CWD da nova cópia fixada. Não trocar silenciosamente os bytes de r1.

Prepare preserva evidência e cria candidato/CAS isolados. Binding, publicação, index/read e testes em Actions continuam obrigações separadas.
