# Fabric Studio

**Seu Fabric, organizado em torno do que você precisa fazer.**

## O que estamos desenhando

Um módulo nativo do Orchestra para entender, construir, modificar e operar soluções Microsoft Fabric. O backend oferece capacidades conhecidas e qualificadas. A interface é composta sob demanda, a partir de uma declaração, usando ferramentas Solid confiáveis e layouts coerentes do Orchestra.

O usuário pode começar por um template ou descrever um objetivo. Depois pode ajustar, salvar e compartilhar a composição — sem compartilhar credenciais, conceder permissões ou executar mudanças por abrir uma tela.

**Estado:** desenho E2E proposto para revisão. Nenhuma integração real foi implementada ou qualificada nesta etapa.

## Documentos

| Documento | Para que serve |
| --- | --- |
| [DESIGN.md](./DESIGN.md) | Desenho de referência: produto, jornadas, arquitetura, declarações, segurança, dados, execução, recuperação, evidências e derivação de specs. |
| [COVERAGE.md](./COVERAGE.md) | Mapa das famílias Fabric, superfícies candidatas, limitações e tratamento explícito do que ainda não pode ser prometido. |
| [TEMPLATES.md](./TEMPLATES.md) | Biblioteca proposta de experiências, com composição, capacidades, menor privilégio, evidência de conclusão e indisponibilidade. |
| [RESEARCH.md](./RESEARCH.md) | Pesquisa dos dois agentes, fontes críticas conferidas, encaixe real no Orchestra e correções incorporadas. |

## A ideia em um desenho

```mermaid
flowchart LR
  A[Objetivo ou template] --> B[Declaração validada]
  B --> C[Componentes e layout confiáveis]
  C --> D[Espaço de trabalho adaptado]
  D --> E[Capacidades Fabric preparadas]
  E --> F[Serviços reais do Fabric]
  F --> G[Resultados, evidências e histórico]
  G --> D
```

Compor um espaço não executa uma operação. Comandos passam por identidade, escopo, política, precondições e aprovação quando exigida. O Fabric continua sendo o runtime de dados e processos.

## Como este desenho vira specs

1. Revisar direção de produto, modelo de interação e decisões propostas.
2. Resolver as questões bloqueantes de identidade, placement, dados e qualificação.
3. Derivar as specs listadas na seção 23 do desenho, com rastreabilidade para jornadas, invariantes, famílias e critérios de aceitação.
4. Congelar contratos compartilhados antes de distribuir implementação.
5. Implementar e qualificar fatias completas de trabalho, sem chamar catálogo ou mock de suporte pronto.

“Cobrir Fabric” neste desenho significa tratar as áreas explicitamente e declarar limites. Suporte operacional só existe depois da prova por operação/contexto. Não é uma promessa de API universal ou de rollback de todo o ambiente.
