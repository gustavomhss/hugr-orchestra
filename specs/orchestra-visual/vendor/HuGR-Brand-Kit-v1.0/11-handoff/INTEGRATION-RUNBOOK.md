# Runbook de integração — HuGR v1.0

**Não redesenhar. Integrar a entrega aprovada e comprovar o uso.**  
Todos os caminhos de origem são relativos à raiz `HuGR-Brand-Kit-v1.0/`. Caminhos de destino abaixo são convenções a confirmar no repositório, não fatos já descobertos.

## 1. Escolha de arquivo sem adivinhação

| Uso | Origem exata / regra | Limite do kit |
|---|---|---|
| Header em fundo claro | `07-web/brand/logos/hugr-horizontal-compact-primary.svg` | Largura ≥180 px |
| Header em fundo escuro | `07-web/brand/logos/hugr-horizontal-compact-inverse.svg` | Mesma geometria e proporção |
| Símbolo isolado | `07-web/brand/logos/hugr-symbol-primary.svg` ou `hugr-symbol-inverse.svg` | ≥24 px; header compacto pode usar 32–48 px |
| Marca principal, com assinatura | `07-web/brand/logos/hugr-stacked-primary.svg` ou variante `inverse` | Largura ≥320 px |
| Horizontal com assinatura | `07-web/brand/logos/hugr-horizontal-primary.svg` ou `inverse` | Largura ≥480 px |
| Wordmark isolado | `07-web/brand/logos/hugr-wordmark-primary.svg` ou `inverse` | Largura ≥96 px |
| Empilhada sem assinatura | `01-logos/svg/hugr-stacked-compact-primary.svg` ou `inverse` | ≥160 px; não está no subconjunto web nem no componente atual |
| Navegador em 16 px | `07-web/brand/icons/favicon.svg` e `favicon.ico` | Usar arquivos existentes, não novo desenho |
| App/PWA, se aplicável | `07-web/brand/icons/android-chrome-192x192.png`, `android-chrome-512x512.png`, `maskable-192x192.png`, `maskable-512x512.png` | Preservar a diferença entre `any` e `maskable` |
| Apple touch | `07-web/brand/icons/apple-touch-icon.png` | Copiar sem recortar |
| Open Graph padrão | `07-web/brand/opengraph.png` | Cópia de `03-social/opengraph-light.png` |
| Open Graph escuro | `03-social/opengraph-dark.png` | Copiar separadamente se o contexto exigir |
| Uma tinta | SVGs `mono-dark` ou `mono-white` do catálogo | Restrição técnica, não substituto visual padrão |

Área livre: x é o diâmetro da cabeça azul; preferir 1x, com exceção compacta de 0,5x já prevista no kit. O padding interno do SVG não substitui o respiro externo. Consulte `06-tokens/hugr.tokens.json` para os valores consolidados.

### O que NÃO está no subconjunto web

O catálogo `01-logos/svg/` tem seis composições e sete variantes. A pasta `07-web/brand/logos/` tem cinco composições × cinco variantes: `symbol`, `wordmark`, `stacked`, `horizontal`, `horizontal-compact`; variantes `primary`, `inverse`, `flat`, `mono-dark`, `mono-white`.

`stacked-compact`, `flat-inverse` e `mono-current` existem no catálogo completo, mas não são aceitos pelo tipo atual de `HuGRLogo.tsx`. Quando necessário, copie o SVG exato do catálogo e use `<img>` com o caminho correto; não passe strings inválidas ao componente nem amplie tipos sem fornecer os arquivos correspondentes. `mono-current` é a exceção: foi destinado a SVG inline controlado por `currentColor`, não à herança de cor através de `<img>`. Prefira as variantes externas de cor fixa quando bastarem.

## 2. Instalação sem sobrescrever trabalho existente

Antes de instalar, inspecione `git status`, instruções locais e árvore relevante. Registre alterações já existentes. Não faça `reset`, `clean`, `checkout` destrutivo, troca arbitrária de branch ou exclusão para “limpar” o projeto.

Validação local do kit:

```sh
# Execute dentro de HuGR-Brand-Kit-v1.0/
python3 11-handoff/verify_handoff.py
```

O instalador existente copia 36 arquivos para uma subpasta `brand` do diretório informado. **Não passe `public/brand`, ou o resultado será `public/brand/brand`.** Exemplo interativo, depois de confirmar a pasta pública real:

```sh
printf "Diretório público do projeto (caminho completo): "
IFS= read -r PUBLIC_DIR
node 07-web/install-brand.mjs "$PUBLIC_DIR"
```

Código 0: cópia concluída. Código 2: existem arquivos de destino e nada foi copiado nessa recusa. Código 1: uso inválido ou erro. A recusa de uma segunda execução é comportamento esperado; ela não é uma falha a contornar automaticamente com `--overwrite`. Compare origem/destino e faça a mesclagem autorizada. Esse instalador não configura framework, componente React, tags de head nem aplicação de tokens.

Só inclua na publicação os assets necessários. Manual, fontes de edição, templates, evidências e handoff não precisam ficar expostos em `public/`.

## 3. Aplicação mínima

### HTML / qualquer framework

Para a convenção de site servido na raiz, depois da cópia:

```html
<img
  src="/brand/logos/hugr-horizontal-compact-primary.svg"
  width="242"
  height="64"
  alt="HuGR — Human Guardrail"
/>
```

Se o site for servido em subcaminho ou CDN, derive o prefixo da configuração real. Não hardcode `/brand` quando a aplicação usa outro base path. Mantenha o aspect ratio: para `horizontal-compact`, 484:128. CSS do projeto não deve impor largura e altura incompatíveis, filtros de cor, recortes, sombras ou deformações.

### React / TypeScript, somente se essa for a stack

Copie `07-web/components/HuGRLogo.tsx` para a localização apropriada de componentes do projeto e adapte apenas o import/caminho de uso. Exemplo após copiar o arquivo ao lado do consumidor:

```tsx
import { HuGRLogo } from "./HuGRLogo";

<HuGRLogo composition="horizontal-compact" variant="primary" width={242} />
<HuGRLogo composition="symbol" variant="inverse" width={40} />
<HuGRLogo composition="stacked" variant="primary" width={352} />
```

O componente suporta `basePath` e calcula uma dimensão a partir da outra. Prefira fornecer só `width` ou só `height`. O default de 240 px **não** satisfaz as larguras mínimas de `stacked` (320) e `horizontal` com assinatura (480): nesses casos, forneça a largura explicitamente ou escolha composição compacta.

`variant` é explícita: o componente **não** lê automaticamente o tema, o CSS ou a preferência do sistema. Faça a escolha no mecanismo de tema já usado pelo projeto, sem introduzir outro estado global. Para contexto puramente decorativo, use `decorative`; se a marca for o único conteúdo de um link, preserve um nome acessível apropriado no link ou na imagem, sem duplicação.

O TSX foi originalmente apenas transpilado; typecheck completo depende do projeto. Não altere a stack, o modo de JSX ou as dependências para acomodar este exemplo sem antes inspecionar a configuração existente.

### Tokens e tema, sem reestilização global

`07-web/brand/tokens.css` é cópia exata de `06-tokens/hugr.tokens.css`. Ele declara variáveis; não aplica estilos automaticamente ao produto e não baixa fontes. Importe ou carregue os tokens pelo mecanismo já usado na aplicação.

O tema escuro dos tokens usa `[data-hugr-theme="dark"]`. Mapeie o tema existente para esse atributo ou para um adapter local; não substitua a arquitetura de tema do produto. Usar a variante `inverse` no logo não muda automaticamente o tema dos demais elementos, e vice-versa.

Não trocar paleta, tipografia ou componentes da aplicação inteira por conta deste handoff. Nos logos, letras são curvas e independem de fontes. O kit não distribui binários de fontes nem solicita uma troca de fonte no produto.

## 4. Head, manifesto e conteúdo real

Inspecione `07-web/head.html` e mescle com a API de metadados ou o head já existente. Evite duplicar favicon, `og:title`, `og:site_name`, `theme-color` ou manifesto. Para `og:image`, use a URL pública absoluta do arquivo realmente publicado; não invente um domínio e não publique URLs `localhost`, sandbox ou placeholder.

O manifesto fornecido está em `07-web/brand/icons/site.webmanifest`. Seus `id`, `start_url` e `scope` são `/`; `lang` é `pt-BR`. Esses são **defaults do pacote**, não a configuração conhecida do produto. Se a aplicação já tem manifesto, preserve identidade instalada, escopo, protocolo, atalhos e demais campos que não fazem parte da marca. Não mude o `id` de uma aplicação existente sem avaliar a consequência no projeto.

Os quatro `icons[].src` são caminhos relativos ao local do manifesto. Se mover o manifesto para outro diretório, adapte os caminhos nas cópias do projeto. Não copie a arte nem altere seus bytes para resolver um erro de URL. Não adicionar service worker, cache offline ou PWA a um produto que não pediu isso; manifesto pode ser `N/A` com justificativa.

Social, apresentação, documento e e-mail são **aplicações condicionais**, não requisitos de uma integração web simples. Se forem solicitados, leia `05-templates/TEMPLATES-README.md`, preencha dados reais e teste no destino. A prévia de assinatura não equivale a e-mail validado. Não converter a tarefa em publicação nas redes ou envio de mensagens.

## 5. Work packages e axiomas

A ordem é WP-01 → WP-02/WP-03 → WP-04. Não há obrigação de criar épicos/issues ou ampliar escopo. Esta divisão serve para execução e retomada.

### WP-01 — Confirmar destino e contrato de integração

**Entradas:** este handoff; repositório/diretório autorizado; instruções locais.  
**Saída:** registro de sessão preenchido com destino, escopo, superfícies e comandos reais.  
**Passos:** verificar o kit; mapear estrutura/stack/tema/head/manifesto; registrar estado inicial; escolher assets e pontos de edição.

- **Completeness criteria:** destino, branch/estado inicial quando houver Git, diretório público, prefixo de URL, consumidores, tema, validações e ações externas permitidas registrados; nenhuma incógnita material escondida.
- **Success criteria:** outra pessoa consegue apontar de qual arquivo do kit sai cada asset e onde ele será consumido, sem inferir caminhos.
- **Definition of Done:** mapa e plano mínimo registrados; kit íntegro; bloqueios de contexto resolvidos ou explicitamente bloqueantes; nenhuma edição visual.
- **Invariants:** não escolher outro projeto; não apagar trabalho preexistente; não reabrir a aprovação estética; não tratar default de exemplo como configuração descoberta.
- **Quality standards:** caminhos exatos, comandos provenientes do projeto, escopo pequeno e critérios de prova por consumidor; dúvidas resolvíveis são investigadas antes de perguntar.

### WP-02 — Copiar assets e integrar consumidores

**Depende de:** WP-01.  
**Ownership:** diretório de assets de destino e componente/wrapper de marca.  
**Saída:** assets referenciados e aplicação nos consumidores explicitamente acordados.  
**Passos:** copiar sem sobrescrita silenciosa; adaptar base path; selecionar variantes existentes; preservar proporções; conectar tema e semântica acessível.

- **Completeness criteria:** todos os consumidores definidos no WP-01 usam caminhos resolvíveis; claro/escuro e composição compacta tratados quando aplicáveis; cópias adicionais do catálogo explicitamente listadas.
- **Success criteria:** a mesma arte aprovada aparece no tamanho e contexto corretos; não há SVG ausente, variante inventada, recorte ou deformação.
- **Definition of Done:** diff limitado às integrações previstas; assets visuais copiados mantêm SHA-256 da origem; typecheck/build pertinente passa ou tem bloqueio comprovado; capturas do uso real registradas.
- **Invariants:** não editar bytes dos assets visuais; não usar geração de imagem ou redesenho; não contornar conflito com overwrite automático; não espalhar copies divergentes.
- **Quality standards:** componente mínimo, reutilização da arquitetura existente, dimensões explícitas, nenhuma dependência só para exibir logo e ausência de renderização indevidamente pesada acrescentada pela integração.

### WP-03 — Mesclar metadados e configurações aplicáveis

**Depende de:** WP-01; coordena os caminhos de publicação com WP-02.  
**Ownership:** head/API de metadados, manifesto e adapter de tokens/tema autorizados.  
**Saída:** configuração local coerente com a aplicação real, sem mudar a identidade.

- **Completeness criteria:** favicon, metadados, Open Graph, manifesto e tokens classificados como aplicáveis ou `N/A`; origem de domínio, base path e tema registrada; placeholders fora da configuração publicada.
- **Success criteria:** recursos configurados resolvem no ambiente testado, metadados não se duplicam e configuração funcional existente permanece preservada.
- **Definition of Done:** diff de configuração revisado, URLs/caminhos verificados, inexistência de mudança silenciosa no `id` de app, escopo ou service worker; dados ausentes geram bloqueio explícito, não valores fictícios.
- **Invariants:** não editar a arte; não inventar domínio/contato/claims; não substituir manifesto inteiro; não criar PWA/backend/publicação sem escopo.
- **Quality standards:** mesclagem mínima, uso dos mecanismos nativos do projeto e separação entre configuração adaptável e assets congelados; nada publicado apenas para demonstrar conclusão.

### WP-04 — Validar, revisar o diff e fechar a passagem

**Depende de:** WPs aplicáveis anteriores.  
**Ownership:** testes/evidências/registro final; revisão conjunta dos arquivos de entrada compartilhados.  
**Saída:** evidência de funcionamento e estado de retomada inequívoco.

- **Completeness criteria:** cada consumidor e critério obrigatório tem resultado e evidência; HTTP real, mobile, tema e comandos relevantes executados, ou bloqueio documentado; pendências de plataforma fora do escopo separadas.
- **Success criteria:** outra sessão reproduz o resultado sem precisar do histórico do chat; identidade intacta e integração demonstrada no destino acordado.
- **Definition of Done:** todos os requisitos obrigatórios em `PASS`; itens não aplicáveis justificados; zero `FAIL`/`NOT_RUN` obrigatório oculto; diff revisado, mudanças preexistentes preservadas e registro de sessão atualizado. Push/merge/deploy só entram se autorizados e efetivamente concluídos.
- **Invariants:** não transformar ausência de teste em sucesso; não exigir redesenho para fechar; não usar testes históricos como evidência atual; não prometer validação em aplicativo que não foi aberto.
- **Quality standards:** evidências curtas e verificáveis — comando, código de saída, ambiente/rota, captura ou log e arquivo relacionado. “Parece funcionar” não substitui prova.

**Paralelização:** WP-02 e WP-03 podem avançar separados após WP-01, mas arquivos compartilhados (layout, entrada global, tema) precisam de um único responsável por vez. Declare ownership antes de editar; integre e valide juntos no WP-04. Não crie branches ou agentes extras por obrigação.

## 6. Provas mínimas no destino

| Verificação | O que registrar | Limite |
|---|---|---|
| Integridade da entrega | Saída de `verify_handoff.py` | Não prova renderização do produto |
| Origem das cópias | Caminho e SHA-256 de cada asset visual usado | Configuração adaptada tem diff próprio |
| Build/typecheck/test/lint | Comando existente, exit code, trecho relevante | Ausente ou falha anterior: registrar, não inventar PASS |
| Recursos reais | URL/rota testada, status, conteúdo e MIME coerente | Página de fallback com HTTP 200 não é um SVG válido |
| Tela real | Captura do consumidor, viewport e tema | Captura da galeria não substitui a do produto |
| Escala e layout | Tamanho usado, aspect ratio, ausência de recorte/overflow | Não reprojetar ícone para passar |
| Integração acessível | Nome do link/imagem, ordem/foco e contraste da aplicação quando afetado | Não certificar o produto inteiro pelo logo |
| Head/manifesto | Valores efetivos e caminhos resolvidos | PWA/device/email somente quando aplicável |
| Encerramento | Diff/status final e registro da próxima ação | Não descartar arquivos para obter status “limpo” |

Um navegador funcional no projeto é obrigatório quando a tarefa inclui uso web. Navegadores ou clientes adicionais entram conforme o alvo real, não por uma lista infinita de plataformas. Quando houver limitação de ambiente, mantenha `BLOCKED`/`NOT_RUN` e diga exatamente o teste ainda necessário.

## 7. Retomada e reversão

Preencha `SESSION-STATE.template.md` ao atingir um checkpoint. Se a sessão cair, a próxima continua pela ação registrada, sem refazer a direção visual.

Para reverter integração, use o diff/commit identificado e reverta apenas as próprias mudanças, preservando edições preexistentes e evitando comandos destrutivos indiscriminados. O kit-base continua intocado e não precisa ser “reconstruído”.
