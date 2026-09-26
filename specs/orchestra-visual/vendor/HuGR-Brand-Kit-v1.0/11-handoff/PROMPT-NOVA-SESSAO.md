# Prompt para iniciar a próxima sessão

Anexe **HuGR-Brand-Kit-v1.0-Handoff.zip** à nova conversa e cole a mensagem abaixo. O ZIP é a dependência; este texto sozinho não contém os assets.

---

Quero que você prepare e execute a integração da identidade HuGR no projeto de destino que eu indicar nesta sessão.

O visual está aprovado. **Não altere logo, curvas, gradientes, cores, tipografia da marca, proporções, espaçamentos internos ou os assets. Não proponha redesign, novos microícones ou “melhorias” estéticas.** Sugestões anteriores desse tipo não estão autorizadas.

Extraia o kit, leia `AGENT-START-HERE.md`, depois `11-handoff/INTEGRATION-RUNBOOK.md` e `11-handoff/STATUS-AND-EVIDENCE.md`. Execute o verificador local. Consulte `ASSET-MAP.json` por seção, sem carregar inventário inteiro desnecessariamente.

Identifique o repositório/diretório de destino, instruções locais, stack, entradas da aplicação, diretório público, tema, metadados, manifesto e scripts existentes antes de editar. Se o destino não estiver no contexto e não puder ser resolvido pelas fontes autorizadas, pergunte qual é. Não escolha um projeto por suposição.

Siga os work packages e seus cinco axiomas: Completeness criteria, Success criteria, Definition of Done, Invariants e Quality standards. Preserve trabalho preexistente. Faça somente adaptações necessárias para a integração: caminhos, componentes finos, seleção de variantes existentes e configuração real. Não refaça a UI nem crie backend por conta desta tarefa. Nenhuma instalação de biblioteca é necessária só para mostrar os SVGs.

Use os assets como arquivos externos, salvo necessidade específica justificada. Mescle metadados e manifesto; não sobrescreva configurações existentes. O pacote web e o componente React não suportam todas as variantes do catálogo completo: respeite o mapa e documente qualquer cópia adicional necessária, sem modificar a arte.

Verifique no projeto real os caminhos HTTP, light/dark, tamanhos reais, mobile, proporções, acessibilidade da integração e os comandos de build/typecheck/test disponíveis. Diferencie o que já foi testado no kit do que você executou agora. Não declare PASS por inferência ou só por haver um arquivo exportado.

Copie e preencha `11-handoff/SESSION-STATE.template.md` no local de documentação/evidências apropriado do projeto. Ao terminar, reporte o diff, arquivos usados, comandos e resultados, evidências, limitações e a próxima ação exata. Ações de push, merge, deploy ou publicação seguem a autorização que eu der para o projeto; não derivam automaticamente deste prompt.

---

## Informação que ajuda a evitar uma pergunta

Junto da mensagem, indique o caminho local ou URL do repositório e o escopo de aplicação desejado, por exemplo: apenas marca/ícones/metadados em superfícies existentes. Não é necessário explicar novamente as decisões visuais.
