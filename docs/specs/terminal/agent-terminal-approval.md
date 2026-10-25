# Aprovação do spec da Fase 4

2026-10-24, dado pelo dono no chat da sessão: opção A de [agent-terminal.md](agent-terminal.md) (um PTY por comando, mesma semântica e mesmo confinamento do `bash`), com as três mudanças de comportamento:

1. `stdin` do comando passa a ser o TTY em vez de EOF.
2. `NO_COLOR=1` no ambiente do comando.
3. As abas do agente ficam retidas entre as sessões encerradas.

Fora desta aprovação: opção B (shell persistente) e opção C.
