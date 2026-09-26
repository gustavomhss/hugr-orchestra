# Estado, evidências e limites — handoff 1.0

## Decisão do proprietário

O visual do kit v1.0 está aprovado. Esta entrega apenas o torna mais explícito para outra sessão. **Nenhuma sugestão estética anterior foi convertida em tarefa.** O relatório de comparação raster/vetor permanece como registro de origem, não como pedido de retrabalho.

## O que é fato sobre o pacote atual

O inventário foi construído a partir dos bytes de `HuGR-Brand-Kit-v1.0.zip`, e não apenas da mensagem que descreveu a entrega. Veja `ASSET-MAP.json` para o hash desse ZIP, os 295 caminhos originais e as relações de cópia.

| Item | Situação nesta passagem |
|---|---|
| Visual, masters e exports | Preservados, sem edição ou reexportação |
| 295 arquivos da v1.0 | SHA-256 confrontado com a extração original |
| Manifesto original `CHECKSUMS.sha256` | Preservado; cobre os outros 294 arquivos originais |
| Subconjunto `07-web/brand/` | 36 arquivos; 25 logos; correspondências com os originais inventariadas |
| Novos arquivos de handoff | Listados em `HANDOFF-CHECKSUMS.sha256`; separados da baseline visual |
| Verificação desta entrega | Ver `verification.json`; escopo local e resultados explícitos |
| Repositório, domínio e stack de destino | Não definidos nesta entrega |
| Integração em produto do usuário | Não iniciada nesta entrega |

Hashes são controle de integridade contra esta baseline, **não assinatura digital, prova de titularidade ou certificação de segurança**.

## Evidência histórica — não alegar que foi refeita agora

`10-quality/QA-REPORT.md` e `10-quality/validation.json` são os registros da produção da v1.0. Eles relatam checagens de SVG, PNG, PDF, ICO, área maskable, contraste de pares de tokens, renderização do manual e templates, galeria/demo em Chromium, instalador, transpilação TSX e gerador de assinatura.

Preservamos esses relatórios sem alterar seus resultados. Ao reportar à próxima sessão, use “o relatório original registra…”, não “testei agora…”, salvo quando existir uma nova execução documentada em `verification.json` ou no projeto de destino.

## Limites materiais já declarados no relatório original

| Limite | Conduta correta |
|---|---|
| TSX: só transpilação sintática, sem typecheck completo React | Rodar os comandos reais da stack de destino quando usar o componente |
| Navegador histórico: fixture com recursos locais em data URIs | Testar URLs e renderização na aplicação servida de verdade |
| Sem validação nativa em Safari, Figma, Illustrator, Office ou clientes de e-mail | Testar o alvo pertinente ao escopo; não reivindicar compatibilidade comprovada nesses apps |
| PWA em dispositivo físico e ICNS em app macOS não instalados | Tratar como testes condicionais ao produto, não “prontos porque exportados” |
| Contatos, URLs, conteúdo e escopo reais ainda não preenchidos | Resolver no destino; não inventar placeholders de produção |
| Arte de impressão em RGB, sem prova gráfica/PDF-X/Pantone | Não anunciar pronta para qualquer gráfica; seguir validação gráfica se solicitada |

Nada disso autoriza alterar o visual aprovado ou exige testar todo formato antes de integrar um header web. Escopo de teste deve acompanhar o uso real.

## Armadilhas de integração conferidas no código entregue

| Evidência local | Implicação operacional |
|---|---|
| `07-web/components/HuGRLogo.tsx` contém cinco composições e cinco variantes | Não aceita `stacked-compact`, `flat-inverse` ou `mono-current` |
| `variant` é uma prop com default `primary` | Tema escuro não escolhe automaticamente `inverse` |
| Default de largura de 240 px para composições não-symbol | Definir largura adequada para assinaturas: `stacked` ≥320, `horizontal` ≥480 |
| `basePath` default `/brand` | Ajustar para subpath/CDN real; não presumir hosting na raiz |
| `tokens.css` contém variáveis e seletor `data-hugr-theme` | Não é um sistema de componentes e não reestiliza a UI sozinho |
| `install-brand.mjs` acrescenta `/brand` ao destino | Passe o diretório público, não a pasta `brand` |
| Recusa de colisão do instalador retorna 2 | Não é sinal para executar `--overwrite` automaticamente |
| Manifesto usa `/` e nomes de ícone relativos | Mesclar valores reais; manter URLs coerentes com onde o manifesto fica |
| `09-source/` contém SVG, geometria e definições de gradiente | Não há um pipeline completo de reconstrução documentado no kit; não prometer um comando de rebuild que não existe |

Essas observações são orientação de uso, não uma solicitação de alterar o código-base do kit. Adapters mínimos podem ser criados no projeto de destino quando necessários, com testes.

## Critério de aprovação por evidência

Use somente estes estados: `PASS` (testado com evidência), `FAIL` (executado e falhou), `NOT_RUN` (ainda não executado), `BLOCKED` (impedimento identificável) e `N/A` (fora do escopo, com motivo). Não chame `NOT_RUN` de “pendência não bloqueante” sem antes conferir se o teste é requisito da integração acordada.

Uma passagem limpa termina com escopo, diff, evidências e próxima ação claros. Não depende de expandir o brand kit, de criar novos desenhos ou de testar plataformas que o projeto não usa.
