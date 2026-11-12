Correção **app-session L1 r3 pronta para transporte de revisão**, sem julgamento próprio.

- Corpo completo: `corrections/l1-r3-app/l1.md` — **42.047 bytes**, SHA-256 `67a2787d0813738c8930a23253c9d185933cc228e997d530056cd4fa98b0b16e`.
- Diff exato contra r2: `l1.diff`. Foram três inserções normativas curtas e uma substituição pontual da frase de retry.
- Autoridade e transporte agora explicitam a ordem estabilidade/simplicidade/desempenho, o benchmark obrigatório antes/depois de alterações de sessão/timeline, geração do Client sem edição manual dos arquivos gerados e a proibição de dependências runtime do Client em Core/Server, distinta da exceção browserSafe da UI.
- A reutilização equivalente do ID retorna a admissão anterior; a reutilização não equivalente rejeita. A distinção entre equivalência de retry e de projeção permanece.
- `decisive-delta.md` traz as três testemunhas AGENTS exatas. `sources-delta.json` reutiliza as capturas existentes, sem contagem dupla. `family-delta.json` limita-se aos campos semânticos de authority, transport, timeline e benchmarks.
- `changed-spans.json` e `verification.json` comprovam as quatro operações e os cinco trechos de resto inalterado. Revertê-las reproduz exatamente o r2 canônico. Skills permanece byte-idêntico, assim como os corpos desktop/design r2.
- Contagens mantidas: app-session **255 capturas**, **1.887 paths**, **234 inspected / 1.623 family-supported / 30 metadata-only**; união S2 **4.506 paths únicos**.

Pedido, resposta pública, fontes, respostas originais, resumo e hashes estão na área exclusiva. Nenhum produto, teste, benchmark ou gerador foi executado; nenhuma escrita remota ou acesso a oracle/pacote/decisão de juiz ocorreu. **L2–L4 continuam bloqueados. Aguardo a comunicação da principal sobre o transporte de revisão.**

