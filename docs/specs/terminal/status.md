# Terminal: estado de entrega

2026-10-24, branch `terminal-epic`, PR #894. Escopo é o de `plan.md` seção 1.1 (prevalece); o que foi cortado lá fica cortado.

## Entregue

- **Fase 1:** escrita sincronizada (modo 2026) no cliente, com timeout de 250 ms.
- **Fase 2:** attach com lacuna reinicia o terminal e força repaint; sessão encerrada ainda serve o histórico retido.
- **Fase 3:** shell integration para zsh e bash com nonce (OSC 133) e cwd (OSC 7).
- **Fases 4 e 5:** o comando em primeiro plano do `bash` pode rodar num PTY visível, com o mesmo confinamento (spec e aprovação em `agent-terminal*.md`).
- **Fase 6:** aba `agent:` na UI com estado (`✓`, `✗ código`), cwd herdado pelo novo terminal, aviso de comando longo que termina fora de vista.
- **Fase 7:** descrição do `bash` coerente com a flag, teste real do tool até o PTY, D-4 (engine `claude-code` sem aba do agente).

## Flags (permanentes, opt-in)

| Flag | Liga | Por que fica desligada |
|---|---|---|
| `ORCHESTRA_AGENT_TERMINAL` | comando do agente em PTY visível | falta um e2e com sessão e modelo reais |
| `ORCHESTRA_SHELL_INTEGRATION` | marcas OSC 133 e cwd OSC 7 nos terminais da UI | substitui um `trap DEBUG` do usuário no bash em vez de encadear |

Rollback: desligar a flag volta ao comportamento anterior; nada é migrado.

## Limites conhecidos

- Cliente que para de ler faz o servidor crescer (medido; não resolvido).
- A aba do agente só nasce de `pty.created` com a UI conectada; comandos de quando ela estava fechada não ganham aba.
- O cwd herdado exige a shell integration ligada (ou um shell que emita OSC 7) e é só uma dica.
- Abas de shell não avisam fim de comando longo (o cliente não lê as marcas).
- Engine `claude-code`: sem aba do agente.
- Não verificados: backend omni, Linux, Windows (excluído do runner do agente), notificação da plataforma, verificação manual de Claude Code e Codex em TUI.
