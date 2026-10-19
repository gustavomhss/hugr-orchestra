# Orchestra — escopo dos chapters C01–C13

Decisões tomadas pelo lead, com delegação explícita do dono em 2026-10-02, a partir
de discovery read-only de cada chapter contra `identity-integration@2e148c06ae`.
Regras aplicadas: reutilizar infraestrutura Orchestra existente; não inventar backend,
scheduler ou dados de exemplo; MVP honesto, sem controle simulado.

## Decisão por chapter

| Chapter         | Decisão    | MVP (dentro)                                                                                                                                  | Fora do MVP                                                                                               |
| --------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| C01 MCP         | Onda 1 (M) | Inventário real por perfil: status, erro, busca, conectar/desconectar e OAuth pela API existente; servidor sem MCP mostra indisponível        | Adicionar/editar/remover persistente, catálogo de tools, marketplace, MCP no Protocol V2                  |
| C02 Skills      | Onda 1 (S) | Catálogo e leitor: nome, descrição, local exato e conteúdo como texto seguro; rótulo "registrada"                                             | CRUD, toggles, instalação, nova sintaxe de invocação                                                      |
| C07 CI/CD       | Onda 1 (S) | Inventário read-only de `.github/workflows/*.yml\|yaml`, preview do fonte e ação para discutir o workflow no Chat                             | Criar/editar, Run/Stop, logs hospedados, deploy, motor local                                              |
| C09 .env        | Onda 1 (M) | Importar arquivo do cliente, editar chaves mascaradas, baixar resultado; parser que preserva linhas intocadas; só memória, isolado por perfil | Salvar no servidor, injeção de ambiente, cofre de segredos                                                |
| C11 Agents      | Onda 1 (S) | Roster read-only com detalhes reais (modo, modelo, allowance, permissões) e abrir Chat com o agente escolhido                                 | CRUD, mudança de política de permissão, métricas                                                          |
| C10 Home/KPIs   | Onda 2     | "Uso registrado" (sessões, categorias de token, ranking, CSV), fora do caminho crítico de render da Home; gasto V2 aparece como indisponível  | Impacto, horas, commits/PRs, comparação de períodos                                                       |
| C12 Workspaces  | Onda 2     | Raiz + sandboxes do projeto e seleção para novo draft                                                                                         | Criação enquanto o gate de produção de worktree experimental não for decidido; editar caminho/tipo/branch |
| C13 Dock        | Onda 2 (L) | Um controlador de Dock por janela compartilhado entre destino Dock e aba Apps; perfil de browser nativo por repositório                       | Bibliotecas isoladas, múltiplos perfis por repositório, novo engine                                       |
| C03 LLM Plugins | Adiado     | —                                                                                                                                             | Ativação de comportamentos exige backend inexistente                                                      |
| C04 Hooks       | Adiado     | —                                                                                                                                             | Regras declarativas/execução exigem backend inexistente                                                   |
| C08 Agendar     | Adiado     | —                                                                                                                                             | Não há MVP honesto sem scheduler durável                                                                  |
| C05 Providers   | Adiado     | Painel de Settings existente continua sendo o destino                                                                                         | Página dedicada só duplicaria o painel                                                                    |
| C06 Shortcuts   | Adiado     | Painel de Settings existente continua sendo o destino                                                                                         | Overrides por perfil                                                                                      |

Chapters adiados mantêm o marcador "rework pendente" e o diálogo atual.

## Costura comum (congelada antes da onda 1)

- Rota `/orchestra/:chapter` (`LayoutRoute` `{ type: "chapter" }`), só no layout novo.
- `packages/app/src/orchestra/chapter-route.tsx`: um chapter implementado registra
  sua página em `chapterPages` com uma linha `lazy(() => import("./chapters/<id>"))`.
  A página recebe `{ server, directory }` do perfil selecionado e roda dentro de
  `ServerSDKProvider`, `ServerSyncProvider` e `SDKProvider` desse perfil; sem perfil,
  a rota mostra o estado vazio. Troca de perfil remonta a página.
- Sidebar: item com página registrada navega para a rota, perde o marcador pendente
  e recebe `aria-current`; ao abrir, carrega o perfil atual para a seleção da Home.
- Breadcrumb do titlebar usa o rótulo do item de navegação (`orchestra/navigation.ts`).

## Aceite comum de cada chapter

- Dados reais da API existente; nenhum número, status ou controle simulado.
- E2E navegando pela sidebar; troca de perfil durante request não vaza dado de outro
  perfil; mesmo diretório em servidores diferentes fica isolado.
- Estados de carregamento, vazio, erro e indisponível; teclado, dark/light, RTL.
- Copy via `src/i18n/orchestra.ts` (inglês do designer), sem traduções inventadas.
- Prova de mutação para cada assert novo.
