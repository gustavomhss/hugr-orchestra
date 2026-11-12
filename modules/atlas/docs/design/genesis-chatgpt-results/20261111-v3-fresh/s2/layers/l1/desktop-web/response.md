Produção da **correção L1 r2 concluída**, pronta para a principal integrar e submeter ao julgamento da camada. Os três corpos completos estão na área exclusiva:

| Unidade | Corpo corrigido | Bytes |
|---|---|---:|
| app-session | [l1.md](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/app-session/l1.md) | 40.081 |
| design-tui | [l1.md](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/design-tui/l1.md) | 36.964 |
| desktop-web | [l1.md](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/desktop-web/l1.md) | 29.075 |

**App-session:** a seção própria explica o formato do catálogo, a falha integral do decoder, visibilidade, identidade por caminho, classes de ownership, raízes editáveis/governadas, formulário path/mtime, writes e limites da fronteira API/serviço. Mede **5.976 bytes**.

**TUI:** a seção `V2 session action boundary` enumera operações, caminhos POST, payloads, seleção sequencial, contexto synthetic, adaptação de files/agents, staging/clear e limitações de retry/cancelamento. Mede **5.817 bytes**. O bloco terminal restante ficou em **11.795 bytes**, com todo o texto herdado posterior preservado.

**Desktop:** somente o parágrafo autorizado foi ajustado para explicitar `userData/global` e separar o código da orientação/histórico. A evidência inclui cap/race/predicado de readiness, publicação após saúde, tradução nativa tipada e `contextBridge.exposeInMainWorld("api", api)`. Os achados estáticos existentes permanecem.

Entreguei [decisive-delta.md](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/decisive-delta.md), [decisive-delta-desktop.md](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/decisive-delta-desktop.md), [sources-delta.json](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/sources-delta.json) e [family-delta.json](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/family-delta.json), além das respostas originais, capturas e diffs. O delta de família contém apenas os campos semânticos de `mcp-skills`; a principal recalcula os counts.

A reconciliação por unidade está explícita: **app 255 capturas, TUI 198, desktop 193**, sem contagem dupla. Foram verificados **14 corpos de fonte**, **38 trechos exatos** e a preservação dos **12 arquivos originais**. A união continua em **4.506 paths únicos**, com hash `8b70f96dcbb623bdd1cc2a48b61d51d255d9d9ce90836efc9a5cd05f1fc5a582`. Nenhum caminho anteriormente citado foi retirado.

Detalhes e hashes completos estão em [change-summary.md](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/change-summary.md) e [verification.json](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/verification.json); o pedido público foi preservado em [producer-request.md](sandbox:/workspace/scratch/7b5d6430f420/genesis-s2/corrections/l1-r2/producer-request.md).

**Sem julgamento próprio, acesso a oracles/packets, alteração de produto, escrita remota ou execução de produto. L2–L4 continuam bloqueados até o julgamento integral de L1.**

