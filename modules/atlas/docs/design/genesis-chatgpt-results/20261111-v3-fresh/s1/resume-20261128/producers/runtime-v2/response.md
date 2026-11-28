# Correção v2 de `s1.core.runtime` pronta para revisão

Entreguei [body.md](sandbox:/workspace/scratch/dd08f46a3e40/agents/correct_runtime/body.md), com **6974 bytes UTF-8** e SHA-256 `01fddc30b43eca26c191999b44e5cebb030aa7d770743827aa4fd0f5794c5108`.

- **F01:** o predicado Omni agora distingue `expected:false` com zero spawns/zero delegações, a condição `expected || delegations > 0` e a recusa de delegação em modo strict.
- **F02:** `exact:true` foi limitado ao caminho básico de criação; `shellIntegration:true` explícito pode substituir argumentos e acrescentar ambiente por meio da preparação retornada. Não foi afirmada inspeção do helper interno.
- **F03:** a retenção de 25 terminais encerrados foi descrita como política assíncrona; limpeza da primeira linha, repaint em `activate()` e ausência de limite de memória para cliente WebSocket lento ficaram condicionados corretamente.
- **F04:** a coordenação das duas superfícies HTTP e a geração em `packages/client` aparecem como obrigações normativas da skill, separadas de prova de execução.

Foram preservados os demais trechos do original `331d26e17158e0770af02c8772bd01a421dbda1a0bc82802da825f3666fba534`. As âncoras PTY foram ampliadas e a de `pty/protocol.ts` foi acrescentada.

[delta.json](sandbox:/workspace/scratch/dd08f46a3e40/agents/correct_runtime/delta.json) contém antes/depois e identidades; [recipe.json](sandbox:/workspace/scratch/dd08f46a3e40/agents/correct_runtime/recipe.json) registra as fontes realmente lidas. Os três retornos adicionais de constantes, criação e ativação foram preservados na mesma pasta e conferem com o blob PTY `fc08cb64d832f77b145c4c9702d417d7db49c14f` do baseline fixado.

Estado **REVIEW**. Nenhum oracle ou parecer privado foi lido; não houve teste, geração de cliente, execução de produto, escrita remota ou commit. Nenhum PASS foi declarado.
