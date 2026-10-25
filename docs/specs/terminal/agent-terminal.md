# Terminal, Fase 4: agente em PTY (spec para aprovação)

2026-10-24. Sem código de produto até este spec ser aprovado. Fatos sobre o `bash` vêm de `packages/core/src/tool/bash.ts`; o que não está confirmado no código está marcado **[a confirmar]**.

## O que o `bash` faz hoje e não pode regredir

Cada chamada é um processo novo, sem estado entre chamadas (o texto do tool diz que `cd` e variáveis não persistem), com `stdin: "ignore"`. Antes de rodar, passa por:

| Garantia | Onde (`bash.ts`) |
|---|---|
| diretório externo e `workdir` pedem permissão | 174-181 |
| aviso de argumentos que citam diretório externo | 183-186 |
| `permission.assert` por comando | 187-194 |
| segurança de git (`ToolSafetyGit.before`, usa `ToolSafetySandbox.environment()`) | 209-214 |
| sandbox e ambiente limpo de credenciais, ambos via `ToolSafetySandbox.wrap` (o comentário da linha 218 diz que o background tem "o mesmo confinamento e a mesma limpeza de ambiente") | 224, 236 |
| inspeção de cada chunk de saída (`OutputInspector`), que nega ao detectar motivo | 235-246 |
| teto de captura (`MAX_CAPTURE_BYTES`, 1 MiB), timeout e tratamento de timeout | 207, 238-240, 252 |
| background pela mesma confinagem (`sessionProcess.launch`) | 215-232 |

`Pty.create` hoje monta o ambiente com `process.env` cru e não usa sandbox (`pty.ts:216-220`). **Um PTY de agente construído sobre ele como está perde tudo acima.** Todo o desenho abaixo existe para não perder.

## Decisão que preciso de você

| Opção | O que é | Ganha | Custo e risco |
|---|---|---|---|
| **A (recomendada)** | Cada comando do agente roda num **PTY próprio**, com `shell -c`, sob o mesmo sandbox. O processo sai, o PTY fecha. | Terminal ao vivo numa aba, TTY de verdade (cores, `isatty`), humano pode digitar no stdin ou dar Ctrl+C, mesma semântica de hoje (sem estado). Conclusão é o **exit do processo**: sem marcas nem nonce. | Muda `stdin` de `ignore` para o TTY; saída tem escapes e `\r` que precisam de limpeza. |
| B | **Shell persistente** do agente com as marcas OSC 133 da Fase 3. | `cd`, venv e `export` valem entre chamadas. | Muda a semântica do tool, o sandbox precisa envolver um shell longo, o humano pode digitar no mesmo shell que o agente usa (a permissão por comando não vê isso), exige protocolo de assumir e devolver. Tamanho de épico. |
| C | Manter a execução como está e só **espelhar a saída** numa aba somente leitura. | Visibilidade sem risco, nenhuma mudança de execução. | Sem TTY, sem interação do humano. |

**Recomendo A** para este épico: entrega visibilidade e interação, preserva a semântica e as garantias, e dispensa o que a Fase 3 construiu (as marcas ficam prontas para B, sem uso). **B fica como épico próprio**, se você quiser estado persistente entre chamadas.

## Desenho da opção A

**Onde.** Um runner alternativo dentro do `bash`, atrás da flag `ORCHESTRA_AGENT_TERMINAL` (desligada). Muda só a execução em primeiro plano (linhas 234 a 262); tudo antes (permissões, git, aviso, `workdir`) e o modo `background` ficam como estão. Mesmo `Input`, mesmo `Output`, mesmas permissões.

**Confinamento.**
- O comando passa por `ToolSafetySandbox.wrap` como hoje; o PTY executa **o comando já envolvido**, sem reconstruir nada. A limpeza de ambiente vem dentro desse comando **[a confirmar em `tool-safety-sandbox`]**.
- O ambiente do PTY é o do comando envolvido mais as variáveis abaixo, **nunca** `process.env`. Para isso `Pty.create` ganha uma opção explícita de ambiente sem herança (`inheritEnv: false`).
- `OutputInspector` continua inspecionando cada chunk, agora do fluxo do PTY, e a negação continua abortando o comando.
- Teto de captura e timeout iguais; abort e timeout encerram **a árvore** de processos (omni `stop` com a mesma graça de 3 s de hoje).

**Ambiente adicional.** `ORCHESTRA_AGENT=1`, `ORCHESTRA_TERMINAL=1`, `PAGER=cat`, `GIT_PAGER=cat`, `NO_COLOR=1`, `TERM=xterm-256color`, tamanho 200×50 (para não cortar `ls`).

**Saída para o modelo.** Os bytes do PTY são limpos antes: sem sequências CSI e OSC (incluindo OSC 52), `\r` aplicado como sobrescrita de linha, caracteres de controle fora `\n` e `\t` removidos, e então o teto de captura. O `Output` é o mesmo de hoje (`exit`, `truncated`, `timeout`, texto). A saída do terminal é **dado**, nunca instrução, e continua entrando como resultado de ferramenta.

**Conclusão e exit code.** Vêm da saída do processo. Nada de marcas, nonce ou nível de integração nesta opção.

**Visibilidade e interação.** A aba aparece com o título `agent: <comando>` e fica retida depois do fim, no limite atual de sessões encerradas. Sem campo novo em `PtyInfo`, então **sem mudança de protocolo nem de SDK**. O humano pode digitar no stdin do comando e dar Ctrl+C. Não há pausa do agente nem passagem de estado.

## Mudanças de comportamento que você aprova

1. **`stdin` deixa de ser EOF.** Um comando que pergunta algo (`npm init`, `ssh`, `rm -i`) hoje recebe EOF e falha; no PTY ele espera o humano ou o timeout. O modelo não é avisado. Aceito, ou prefere forçar EOF (perdendo a digitação do humano)?
2. **`NO_COLOR=1`**: a aba mostra saída sem cor para o modelo ler limpo. Aceito?
3. **Abas do agente ficam retidas** entre as sessões encerradas (teto 25). Aceito?

## Fora de escopo

- **Engine `claude-code`**: o `Bash` dele é executado pelo provedor e não passa por este caminho. Não suportado nesta fase; nada na UI a mudar.
- Shell persistente, marcas no caminho do agente, atribuição por campo, pausa e devolução, leitura de tela de programas interativos (opção B e adiante).
- **Backpressure do WebSocket**: um cliente que para de ler faz o servidor crescer (medido). Vale também para essas abas. Não resolvido aqui.

## Pontos a confirmar na primeira hora de implementação

- **[a confirmar]** Como extrair arquivo e argumentos do comando devolvido por `ToolSafetySandbox.wrap`. Se for opaco, o runner chama o omni diretamente com PTY em vez de passar por `Pty.Service`, e a aba continua registrada por ele.
- **[a confirmar]** Se `OutputInspector` precisa de bytes ou texto; o PTY entrega texto UTF-16.
- **[a confirmar]** Se o `ghostty-web` ignora OSC 52 (a Fase 1 já pede checagem manual). Sem campo de atribuição não há como negá-lo só nas abas do agente; ele precisa ser ignorado em todas.

## Validação

Testes nomeados, rodando local nos arquivos tocados e no CI do épico:

- **Paridade com o bash**: os mesmos casos nos dois runners, com a mesma decisão: negado pelo sandbox, credencial em variável ausente do comando, diretório externo pede permissão, `workdir` externo pede permissão, git inseguro negado, `OutputInspector` nega, teto de captura, timeout, exit code, abort mata a árvore, `background` intacto.
- **TTY**: saída com `\r`, cores forçadas por `TERM`, e CSI/OSC na saída chegam limpos ao modelo; OSC 52 na saída não chega ao modelo.
- **Interação**: um comando que lê stdin termina quando o teste digita, e cai no timeout quando ninguém digita.
- **Flag desligada**: o `bash` se comporta exatamente como hoje (suíte existente do bash sem alteração).

**Pronto quando** a suíte de paridade passa, a flag liga por padrão e uma sessão real mostra o comando do agente na aba e termina com o exit correto. Qualquer divergência de permissão entre os dois runners bloqueia.
