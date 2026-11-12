# Comandos futuros — não executados

A materialização está pronta. Estes comandos só fazem sentido após aceite da seleção exata e depois de materializar o pacote, corpos, protocolo, receitas e referências em `source-root`. O pacote principal atual permanece incompleto e r1 recusa `schema/tui.json`.

## Ambiente

```bash
S2_SETUP=/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work
S2_BUN="$S2_SETUP/tools/bun-package/bin/bun"
S2_CODE="$S2_SETUP/runtime-code/modules/atlas"
S2_SOURCE="$S2_SETUP/source-root"
```

Versões já observadas: Bun 1.3.14; Node v24.22.1; TypeScript 5.9.3. O código corresponde exclusivamente ao candidato e3a8ab8cf56dbff1ee91272df51ffa398d882aa1.

## Finalizar dependências e build do adapter após aceite

```bash
node "$S2_CODE/scripts/fix-scip-types.mjs"
cd "$S2_CODE/packages/adapter-io"
"$S2_BUN" run typecheck
```

O script de typecheck usa o build TypeScript do projeto e suas referências para gerar os `dist` necessários. Este é build local, não CI e não execução de testes. Não executar a suíte de produto localmente.

## Preparar uma seleção aceita compatível com r1

Defina `S2_ACCEPTED_PACKAGE` com o caminho do pacote aceito relativo a `S2_SOURCE`. A seleção deve conter todos os seus artefatos requeridos, roots coerentes, dois pareceres semânticos preservados por artefato e todas as fontes/receitas. O diretório de saída deve existir, e o arquivo de saída deve ser novo.

```bash
cd "$S2_CODE"
mkdir -p "$S2_SETUP/outputs"
: "${S2_ACCEPTED_PACKAGE:?Defina o caminho relativo do pacote aceito e compatível com r1}"
S2_OUTPUT="$S2_SETUP/outputs/s2-prepared-v1.json"
[ ! -e "$S2_OUTPUT" ] || exit 1
"$S2_BUN" scripts/genesis-native.ts prepare "$S2_SOURCE" "$S2_ACCEPTED_PACKAGE" "$S2_OUTPUT"
```

Esse comando é a operação real descoberta em r1. Ele não foi executado neste trabalho. Deve ser interrompido antes de execução se a seleção ainda estiver pendente, faltar uma referência ou incluir `schema/tui.json` sob r1.

## Para consumir a futura correção S4

Reler o release pelo conector GitHub, fixar o novo commit/candidato e materializar outra versão isolada. Não substituir silenciosamente os arquivos de r1. Preservar fontes completas, reexecutar preparação sobre a versão compatível e obter os bindings realmente exigidos. Publicação, index/read e consumidores precisam de evidência própria; não estão autorizados por este recibo de infraestrutura.
