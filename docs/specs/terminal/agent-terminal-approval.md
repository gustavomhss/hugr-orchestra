# Aprovação do spec da Fase 4

2026-10-24, dado pelo dono no chat da sessão: opção A de [agent-terminal.md](agent-terminal.md) (um PTY por comando, mesma semântica e mesmo confinamento do `bash`), com as três mudanças de comportamento:

1. `stdin` do comando passa a ser o TTY em vez de EOF.
2. `NO_COLOR=1` no ambiente do comando.
3. As abas do agente ficam retidas entre as sessões encerradas.

Fora desta aprovação: opção B (shell persistente) e opção C.

## Fase 7: o que ficou decidido

- **D-4, engine `claude-code`: não suportado.** O `Bash` desse engine é executado pelo provedor e não passa por `bash.ts`, então o agente-em-PTY não o alcança. Não há texto novo na UI: com esse engine a aba `agent:` simplesmente não existe. Declarado aqui e em `.orchestra/skills/terminal-maintenance`.
- **Plugin `pty-environment`:** só os handlers HTTP de PTY aplicam o hook ao ambiente de um terminal do usuário. O caminho do agente chama `Pty.create` com `exact: true` e o ambiente já limpo pelo sandbox, e `bash.ts` ainda não aplica `shell.env` (TODO na linha 90), então um plugin não reintroduz credenciais no agente. Se esse TODO for feito, precisa passar de novo pelo sandbox.
- **Eventos:** nenhum evento novo; `event-manifest` não muda.
- **Dock (evidência):** o painel mostra o terminal ativo do workspace; uma aba `agent:` selecionada aparece nele sem código novo (um renderizador por PTY continua valendo).
- **Texto para o modelo:** com a flag ligada, a descrição do `bash` deixa de dizer que não há terminal (`AgentTerminal.stdinNote`, com teste).
- **Fluxo coberto:** `test/tool-bash.test.ts` roda uma chamada real do tool sob a flag até um PTY real: saída sem escapes, exit code, aba `agent:` retida com cwd e status. O e2e com sessão e modelo reais não foi feito (sem provedor no ambiente de teste).
