# Plano de peso

Branch `perf-cut`. A demanda é deixar o Orchestra mais leve e mais rápido. 75% do produto inteiro não foi achado. Esta leva executa o corte de disco já medido. O resto fica especificado e não entra no código até ter prova.

## O que esta leva faz

1. Depois de uma instalação verificada do CLI, apaga as cópias antigas na mesma pasta.
2. Limita o cache de disco do Chromium a 256 MiB.
3. O instalador deixa de levar source map e fonte `.ts` de `node_modules`, e fica só com os idiomas `en`, `en-US`, `pt-BR` e `pt-PT` do Electron.

## O que esta leva não faz

Releitura do histórico, jaula do comando, três cópias do transcript e teto no `AGENTS.md` continuam de fora. Snapshot e a cópia morta do tree-sitter já entraram. O parágrafo de cima descreve só a primeira leva de disco.

## Invariantes

- A cópia que acabou de ser verificada nunca é apagada.
- Uma instalação que falha não apaga nada. A cópia boa anterior continua.
- Só entra na poda um diretório irmão cujo nome termina em `-` e 64 hex. `notes`, `global` e um link não entram.
- O teto de cache não é zero. A página ainda pode cachear.
- O interruptor do cache entra antes do `ready`, junto dos outros.
- Português e inglês do Chromium ficam. Diálogo nativo de arquivo não volta para inglês numa máquina em português.
- O servidor, o binário do Claude e o tree-sitter ao lado do CLI continuam no instalador.
- Nada desta leva muda admissão de prompt, ordem de evento, selo ou sandbox.

## Critério de sucesso

- Um teste instala o CLI, deixa uma pasta irmã com nome de instalação antiga e uma pasta qualquer, instala de novo, e a irmã some. A pasta qualquer e a cópia nova ficam.
- O mesmo teste, com a instalação recusada, mostra a irmã ainda lá.
- Um teste chama o teto de cache num dublê e vê `disk-cache-size` com `268435456`.
- Um teste lê a lista do packager e vê a exclusão de `*.map` e de `*.ts` em `node_modules`, e os quatro idiomas.

## Critério de completude

- Os três cortes acima têm teste. Corte sem teste não conta.
- A nota `perf/weight-hunt.md` e este plano dizem o que ficou de fora e por quê.
- O skill de startup registra a poda, para a próxima pessoa não "otimizar" de volta as cópias.
- Não se afirma 75% de velocidade. O sucesso desta leva é disco, medido pelo teste de presença e ausência de pasta, não por um benchmark de conversa.

## Definition of done

- Os testes novos estão no pacote `desktop` e passam em `bun run test:ci desktop` nos arquivos nomeados. Leva 1: run `42838628811`, linux, 23 pass, 0 fail, nos três arquivos nomeados. Typecheck local não rodou: `tsgo` não está no PATH desta worktree.
- Leva 2, snapshot: run `42844316101`, linux, 1 pass, 0 fail. O stream começa antes do capture terminar, e o passo grava esse snapshot.
- Leva 3, transcript: run `42846837707`, linux, pass. Conversa parada, sem aba e já esquecida, não ganha texto de volta. Aba aberta, ocupada, ou o evento que a marca ocupada, continua.
- `bun typecheck` em `apps/desktop` passa.
- Nenhum arquivo gerado foi editado à mão.
- O diff não inclui segredo, blob de store, nem `git add -A`.

## Padrão de qualidade

- Sem `any`. Sem helper de um uso só, salvo o que o teste precisa chamar sem subir o Electron.
- A poda usa `lstat`. Link não é diretório a apagar.
- Falha de poda não é engolida: se não deu para apagar uma cópia nossa, a instalação falha em voz alta. Não falha antes de a cópia nova estar verificada.
- Texto novo de usuário não existe nesta leva. Não há chave de i18n para inventar.

## Trabalho seguinte, não desta leva

| Corte | Por que ficou | Prova que falta |
| --- | --- | --- |
| Snapshot de git fora do caminho do modelo | Em andamento nesta leva: o stream do provedor começa antes do capture terminar; o passo ainda grava o snapshot de antes das escritas. Host ainda espera, porque authorize pode escrever na hora. Sem cronômetro de repo grande. |
| Não reler o JSON inteiro | A história tem de ser a mesma | Um teste de igualdade do pedido antes e depois |
| Não remontar a jaula | A jaula é o isolamento | Um teste de que o comando continua confinado |
| Uma cópia do transcript, com teto | A tela lê essas cópias | Um teste de que a aba aberta ainda mostra o texto, e a fechada não cresce |
| Teto no `AGENTS.md` | O agente perde instrução | Decisão humana do que cortar |
| Tree-sitter do asar | Feito. Sem import de runtime no app. A cópia do CLI ao lado do binário fica e é a que o pacote verifica. O `beforePack` não recusa a cópia que o asar joga fora. |
