# BRAND — HuGR v1.0 dentro da Orchestra

Status: insumo de marca conferido; integração no produto **NOT_RUN**. Revisão do plano: 4.1. Este contrato substitui somente instruções antigas de reconstruir a marca ilustrativa. Não muda o layout aprovado, budgets, runtime, hierarquia ou autoridade das demais tasks.

## 1. Duas referências, funções diferentes

| Elemento | Autoridade | Consequência |
|---|---|---|
| Layout, proporções, tema grafite, densidade e montanhas | `reference/approved.png`, SHA-256 `e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d` | Não regenerar o mock nem reinterpretar a composição. |
| Geometria, gradientes, cores internas e wordmark HuGR | Assets do kit recebido em `vendor/HuGR-Brand-Kit-v1.0/` | Usar arquivos prontos. Não redesenhar, vetorizar, otimizar, recolorir, converter ou reexportar. |
| Identidade do produto | Orchestra | O envio da marca não renomeia o produto, o repositório, o appId ou a instalação. |
| Tokens e tipografia da aplicação | `SPEC.md` e ThemeProvider existente | Os tokens de UI do kit não substituem o tema grafite aprovado. |

Aplicação operacional proposta: substituir o pequeno símbolo ilustrativo de elo pelo símbolo HuGR, mantendo **Orchestra** como texto separado no mesmo bloco. Isso não é um novo lockup vetorial nem autorização para modificar o wordmark HuGR. A configuração será conferida no primeiro render do cockpit; não requer uma nova rodada de design. A alteração de marca é localizada e explicitamente permitida na comparação com o raster antigo. Não mascarar a sidebar inteira para escondê-la.

A referência raster de marca incluída no kit e a imagem enviada neste turno têm os mesmos pixels RGBA (1254 × 1254), embora os hashes dos arquivos PNG sejam diferentes. Os arquivos para uso são os vetores e exportações existentes do kit, não esses rasters nem os pixels do mock.

## 2. Integridade e leitura mínima

O ZIP recebido tem SHA-256 `9c75596e259593c7b6e2ac9818c6358f207f7e4f9129fec3b93dbf3042fdd115`. O diretório do kit contém 304 arquivos: 295 originais e 9 adições de handoff, incluindo o manifesto adicional. Os 295 originais não são todos imagens: também incluem código, tokens, templates e documentação.

Leia, sem despejar o inventário inteiro no contexto de cada agente:

1. `vendor/HuGR-Brand-Kit-v1.0/AGENT-START-HERE.md`.
2. `vendor/HuGR-Brand-Kit-v1.0/11-handoff/INTEGRATION-RUNBOOK.md`.
3. `vendor/HuGR-Brand-Kit-v1.0/11-handoff/STATUS-AND-EVIDENCE.md`.
4. As entradas relevantes de `BRAND-ASSETS.json` e do `11-handoff/ASSET-MAP.json` original.

Comandos a partir da raiz do plano:

```sh
python3 vendor/HuGR-Brand-Kit-v1.0/11-handoff/verify_handoff.py --json
python3 tools/verify_brand.py
# Somente depois de copiar os assets necessários ao worktree:
python3 tools/verify_brand.py --repo /caminho/real/do/worktree
```

Os verificadores são read-only. O primeiro confere integridade/relações locais do kit; o segundo confronta o mapa de integração e, quando informado, os arquivos de destino. Nenhum deles prova foco, legibilidade, HTTP, render, native icons ou performance do produto.

## 3. Seleção de assets e consumidores

As origens abaixo são relativas à raiz do kit. `BRAND-ASSETS.json` contém SHA-256, tamanho e destino por arquivo. Só `symbol-light` e `symbol-dark` são cópias obrigatórias para a primeira integração de marca. Os demais são condicionais a consumidores existentes verificados por S01, sem criar telas ou funcionalidades só para usar o kit.

| Consumidor | Asset exato | Regra de uso |
|---|---|---|
| Marca do cockpit escuro | `07-web/brand/logos/hugr-symbol-inverse.svg` | Símbolo inicial de 32 × 32 CSS px, mantendo nome Orchestra separado. |
| Mesmo bloco em superfície clara | `07-web/brand/logos/hugr-symbol-primary.svg` | Mesma caixa/proporção, sem mudança de layout ao trocar o tema. |
| Marca em espaço de 24 px | Os mesmos símbolos, variante do fundo real | 24 px é o mínimo do símbolo principal no kit. Não encolher abaixo dele para caber. |
| Ícone em 16 px | `02-icons/favicon.svg` ou `02-icons/favicon-16x16.png` | Usar exportação pequena existente; não desenhar microícone novo. |
| Atribuição corporativa em About/créditos já existentes | `07-web/brand/logos/hugr-horizontal-compact-primary.svg` / `...-inverse.svg` | Largura mínima 180 px, proporção 484:128. Não substituir o título Orchestra pelo wordmark HuGR. |
| Favicon web, quando configurado no produto | `02-icons/favicon.svg` e/ou `favicon.ico` | S25 mescla o head real. Cópia em assets não prova URL pública válida. |
| Apple touch / PWA já existente | Exportações específicas de `02-icons/` mapeadas | Preservar distinção any/maskable e identidade do manifesto. Não introduzir PWA. |
| Ícone nativo macOS, quando aplicável | `02-icons/app-icon.icns` | Arquivo fornecido, mas não instalado/testado nesta revisão. S08/S25 conferem packaging e validação nativa. |
| Ícone PNG nativo, quando aplicável | `02-icons/app-icon-1024.png` | Usar no pipeline existente. Não converter recursos só para preencher uma lista. |

Tamanhos mínimos das outras composições, se um consumidor exigir: wordmark 96 px; stacked-compact 160 px; stacked com assinatura 320 px; horizontal com assinatura 480 px. Não colocar o logo completo com assinatura numa sidebar de 230 px comprimindo-o até a linha “Human Guardrail” ficar ilegível.

**Respiro:** x é o diâmetro da cabeça azul, aproximadamente 23,8% da largura do símbolo. Preferido 1x; exceção compacta 0,5x. Para a imagem de 32 px, reserve pelo menos cerca de 4 px externos em cada lado — slot inicial de 40 px — e mantenha separação suficiente do texto. Para 24 px, cerca de 3 px. O padding interno do SVG não substitui esse respiro. Ajustar somente o contêiner da aplicação, nunca o SVG.

O símbolo HuGR não substitui ícones de agente, ferramentas, provider, avatar do usuário ou identidade real do workspace. Marca corporativa e estado operacional são entidades diferentes.

## 4. Adapter Solid, sem portar a aplicação

O componente `07-web/components/HuGRLogo.tsx` do kit importa tipos React. Ele é exemplo de integração e não deve ser colado no projeto Solid com uma dependência React nova. Preserve o arquivo original; crie uma casca fina local quando necessário.

Contrato proposto para `packages/app/src/components/orchestra-brand.tsx` (nome de novo arquivo, não alegação de API existente):

- Receber tamanho e papel semântico local; obter a variante pelo tema/resolved surface existente, sem novo estado global.
- Mapear explicitamente as duas URLs dos símbolos. Usar SVG externo por `<img>` e o mecanismo de resolução de assets do Vite/desktop já presente. Confirmar prefixo e base path no build real; não hardcode `/brand`.
- Não injetar SVG por `innerHTML`, não alterar IDs/gradientes, não aplicar filtros, máscaras, efeitos de brilho, sombras novas, `mix-blend-mode` ou recoloração. Duas instâncias externas preservam a independência das definições SVG.
- Reservar largura/altura e aspect ratio antes da carga; não fazer medição do DOM por frame. A troca de tema muda somente a URL/variante, não remonta a sessão ou o composer.
- Se a imagem for decorativa ao lado do nome e link já acessíveis, usar alt vazio e nome apropriado no link. Se ela for o único conteúdo identificador, fornecer nome acessível pertinente. Não repetir duas vezes o mesmo nome no anúncio de leitores de tela.
- Usar o fonte já existente para o texto **Orchestra**. O wordmark HuGR do kit já tem letras em curvas; não há necessidade de baixar fontes.
- Se a view compartilhada `packages/ui/src/components/logo.tsx` tiver consumidores fora da Orchestra, não trocar sua marca globalmente. Manter o adapter local e integração dos slots sob S06/S25. S05 preserva ownership do arquivo shared apenas para eventual seam opt-in necessário, sem alterar os defaults ou marcas dos demais consumidores. S01 confirma os call sites.

O kit web expõe apenas cinco composições por cinco variantes. `stacked-compact`, `flat-inverse` e `mono-current` existem no catálogo completo, mas não no componente de exemplo. Não passar valores inexistentes a ele. `mono-current` não herda `currentColor` do HTML através de `<img>`; não o escolher para tentar recolorir a marca. As variantes primary/inverse bastam para este cockpit.

## 5. Marca não é tema nem manifesto do produto

Os azuis do logo continuam intactos **dentro do asset**. Isso não autoriza transformar bordas, cards ou seleções em neon/ciano. A superfície de UI escura do kit e seu primary sky-blue são defaults de outras aplicações de marca, não uma substituição aprovada da SPEC da Orchestra. Não importar globalmente `tokens.css`, não instalar outro ThemeProvider e não trocar tipografia/densidade.

O instalador do kit acrescenta `brand/` ao diretório informado e copia 36 arquivos. Ele não conhece esta estrutura Vite/Electron. A primeira fatia só precisa de dois símbolos; prefira cópia seletiva com confronto de hashes. Não rodar o instalador apontando para `public/brand`, nem executar `--overwrite` para silenciar colisões.

`head.html` e `site.webmanifest` são modelos a consultar, não arquivos para substituir os do projeto. `id/start_url/scope=/`, `lang=pt-BR`, nome HuGR e caminhos relativos são defaults do kit. Conservar appId/bundleId, nome Orchestra, protocolo, deep links, service worker, updater, canais de release e preferências. Nenhum domínio, conta ou `og:image` de produção deve ser inventado.

Social, impressão, apresentação, documento e assinatura de e-mail permanecem fora da migração do cockpit. Não publicar templates e fontes de edição em `public/`. “Vetor” não implica prova gráfica/PDF-X ou compatibilidade nativa certificada; esses formatos não estão sendo validados nesta integração.

## 6. Performance e peso

O símbolo inverse tem **4.317 bytes de SVG**, 1.380 bytes no gzip local nível 9; o primary tem **15.295 bytes**, 2.301 no mesmo gzip. Isso é uma medida dos arquivos fornecidos, não uma medição de transferência ou render do produto. O PNG de apresentação de 1254 px não deve ser usado como logo pequeno.

Carregar só assets usados, por URL compartilhada/cache normal; nenhuma chamada LLM, fetch recorrente, animação, canvas, WebGL, filtro SVG extra ou polling para exibir a marca. A seleção de variantes deve reutilizar o tema existente. Os budgets P01–P12 não foram aumentados. Relatar peso de recursos nativos do instalador separadamente do custo de primeiro paint; não esconder o ICNS de 425.952 bytes como se pesasse 1.380 bytes.

As margens e os raios aprovados continuam. A leveza não autoriza amputar detalhes do vetor e o refinamento não autoriza efeitos caros. Primeiro usar os arquivos existentes; um problema comprovado de tamanho/legibilidade deve ser resolvido por variante existente ou dimensão do contêiner, não por redesign.

## 7. Responsáveis e sequência — mesma hierarquia

| Responsável | Entrega neste delta | Não fazer |
|---|---|---|
| S01 / #144 | Confirmar consumidores, serving/packaging e destinos condicionais; atualizar apenas bindings/classificações dos contratos BRAND, preservando origens/hashes/arte/políticas | Declarar local census pronto só por receber o ZIP |
| S03 / #146 | Preservar tema grafite; disponibilizar seleção de variante via mecanismo atual | Importar tokens HuGR como substitutos da SPEC |
| S05 / #148 | Copiar assets oficiais; adapter Solid; proveniência; paisagem independente | Reconstruir elo ou logo, alterar/reexportar arte |
| S06 / #149 | Aplicar o bloco símbolo + nome Orchestra ao slot existente | Reorganizar sidebar, renomear produto ou falsificar workspace |
| S08 / #151 | Conferir ícones nativos e superfícies de startup quando aplicáveis | Alegar ICNS instalado apenas porque há um arquivo |
| S24 / #167 | Revisar marca contra kit e layout/paisagem contra master | Obrigar o logo HuGR a parecer o elo ilustrativo antigo |
| S25 / #168 | Integrar slots, URLs/head/manifest/packaging no owner central | Criar outro writer ou sobrescrever configs inteiras |

S01 possui escrita delimitada em BRAND-ASSETS.json/BRAND-INTEGRATION.md para ajustar bindings/destinos quando o checkout exigir; não pode redefinir hashes de origem, arte, políticas de imutabilidade ou budgets. O validador verifica os destinos dentro do escopo de assets S05.

S05-W1-T1 entrega cópias/adapter/paisagem; S05-W1-T2 prova a fatia; W0 confere a composição inicial conectada; gates finais seguem depois da integração. Nenhuma nova dependência ou task foi introduzida. O kit é input pronto, não backend novo. A montanha não está resolvida por ele; continua dentro da S05.

## 8. Provas exigidas na execução

**Antes da cópia:** integridade do kit e do mapa; estado do worktree; consumidor, tema e destinos definidos. Qualquer conflito é comparado, não sobrescrito.

**Depois da cópia:** SHA-256 de cada asset visual igual ao da origem; destino permitido pelo owner. Configuração adaptada tem diff separado. No build servido, testar o recurso real e MIME/conteúdo: uma rota SPA que retorna HTML com HTTP200 não conta como SVG carregado. SVG optimizer/reexport automático que muda bytes precisa ser desabilitado para essas cópias; compressão HTTP que preserva bytes descomprimidos é permitida.

**Render da fatia:** marca em dark/light a 32/24 px, favicon existente no uso de 16 px, múltiplas instâncias, DPI1x/2x, respiro/proporção/sem clipping, foco/nome acessível e falha de carregamento. Não trocar logo por imagem da galeria. A cor do logo pode diferir da cor de interação do produto: são contratos distintos.

**Aceite integrado:** captura do cockpit com marca e texto corretos; demais superfícies aplicáveis; tema/layout/contas preservados; custos do mesmo build; native tests quando o recurso nativo for usado. Anexar os comandos e resultados aos critérios de S05/S08/S24/S25 correspondentes. O sucesso do verificador local do kit não satisfaz esses gates.

Mutações negativas somente em diretórios temporários: byte alterado, primary copiado no destino inverse, arquivo ausente, path com escape/symlink, markup React adicionado ao runtime, tentativa de substituir manifesto, URL de asset retornando HTML. Os quatro últimos comportamentos de produto exigem teste/inspeção no projeto; o verificador de arquivos não os executa.

## 9. Continuidade

A v4.1 não executa nem aprova a implementação. `progress.json` permanece sem PASS. As provas afetadas por novo contrato precisam ser repetidas; não atualizar hashes de recibos antigos para mantê-los válidos. Os testes históricos da v4 e do kit permanecem identificados como históricos. O relatório atual fica em `BRAND-INTEGRATION-REVIEW.md`.

O arquivo recebido pode estar byte a byte intacto e ainda ser aplicado no tema, tamanho ou consumidor errado. Integridade é uma condição de entrada; acabamento e funcionamento continuam sendo condições de entrega.
