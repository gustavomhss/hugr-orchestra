# HuGR · Brand kit v1.0

**Comece por `START-HERE.html`.** A galeria funciona localmente, sem instalação nem conexão externa.

## Uso imediato no projeto

1. Copie `07-web/brand/` para a pasta `public/brand/` do seu projeto. Alternativa: execute `node 07-web/install-brand.mjs /caminho/do/projeto/public`. O instalador recusa sobrescritas por padrão.
2. Use `brand/logos/hugr-horizontal-compact-primary.svg` em cabeçalhos claros e a variante `inverse` em fundos escuros. O componente `07-web/components/HuGRLogo.tsx` também está pronto para projetos React com TypeScript e JSX automático.
3. Importe `brand/tokens.css`, incorpore o conteúdo relevante de `07-web/head.html` e adapte o manifesto ao escopo real da aplicação. Se a aplicação já tem um manifesto ou ícones, mescle os campos, não substitua silenciosamente sua configuração.

```html
<img src="/brand/logos/hugr-horizontal-compact-primary.svg"
     width="242" height="64" alt="HuGR — Human Guardrail">
```

```tsx
import { HuGRLogo } from "./HuGRLogo";
<HuGRLogo width={240} />
<HuGRLogo composition="symbol" variant="inverse" width={40} />
```

## Estrutura

- `01-logos`: seis composições; sete variantes SVG; PNG/WebP transparentes; PDF vetorial; EPS monocromático.
- `02-icons`: favicon ICO multirresolução, SVG/PNG, Apple touch, Android/PWA, maskable e pinned tab.
- `03-social`: avatares, Open Graph, capas e cartão quadrado, em SVG e PNG.
- `04-graphic-elements`: fundos e padrões de arcos em SVG; fundos também em PNG.
- `05-templates`: apresentações e documento editáveis, assinatura de e-mail e peças de comunicação.
- `06-tokens`: cores, tipografia, espaçamento, contrastes, CSS, JSON, ASE e GPL.
- `07-web`: pasta pública, componente React e instalador sem dependências.
- `08-guidelines`: manual visual em PDF e notas de aplicação.
- `09-source`: master SVG em camadas e geometria em curvas para edição.
- `10-quality`: validações, relatório de contraste e comparação com a referência.
- `reference`: imagem aprovada original, preservada sem alterações.

## Qual arquivo escolher

| Contexto | Arquivo SVG |
|---|---|
| Marca principal com assinatura | `hugr-stacked-primary.svg` |
| Navegação / cabeçalho | `hugr-horizontal-compact-primary.svg` |
| Fundo escuro | Mesmo nome com `inverse` |
| Avatar / aplicativo | `02-icons` e `03-social/avatar-*` |
| 16–24 px | `02-icons/favicon-*`, sem assinatura |
| Uma tinta / gravação | Variantes `mono-dark` ou `mono-white`; EPS é uma tinta |
| Componente inline controlado por CSS | `mono-current` — em SVG inline, não em `<img>` |

## O que é vetorial de verdade

Os SVGs de logo contêm curvas, gradientes e recortes; não contêm imagens incorporadas, fontes, JavaScript ou recursos externos. As letras do logotipo e da assinatura estão em contornos. Os PDFs de logo também preservam os vetores. EPS é fornecido somente em uma tinta para evitar achatamento de transparências e gradientes.

A origem aprovada é uma imagem raster. A versão vetorial foi reconstruída e limpa a partir dela; contornos e gradientes não são uma cópia bit a bit dos pixels. A comparação lado a lado e a referência estão no pacote. Os PNGs de produção são renderizados do mesmo master vetorial, para manter coerência entre os formatos. A referência original não é usada escondida dentro de SVG.

## Tipografia de interface

Inter Display 600/700 para títulos; Inter 400/500 para texto e interface. O wordmark HuGR é uma arte própria em curvas, **não** uma composição digitada em Inter. Não há binários de fontes no pacote. Os SVGs de logo não precisam de fontes instaladas; os arquivos editáveis usam Inter e fontes de sistema como fallback. Obtenha a família no projeto oficial: https://rsms.me/inter/ .

## Itens que precisam dos seus dados reais

Os logos, ícones, cores e capas estão finalizados. Templates de apresentação/documento precisam receber seu conteúdo. A assinatura de e-mail é gerada com nome, cargo, contato e URL HTTPS do logo fornecidos por você; nenhum dado pessoal foi inventado. `og:image` também precisa da URL pública absoluta do seu domínio. O manifesto assume aplicação servida em `/`; ajuste `id`, `scope` e `start_url` se sua aplicação usar outro caminho.

## Impressão

SVG/PDF de logo são masters RGB para edição e uso digital. Faça prova de cor e conversão com o perfil ICC da gráfica para CMYK. Não há equivalência Pantone, PDF/X nem perfil de impressão certificado neste pacote. O EPS monocromático é apropriado como arte-base de uma tinta, sujeito ao processo e tamanho de produção.

## Integridade e escopo

`assets.json` descreve os masters; `CHECKSUMS.sha256` permite verificar o pacote. O relatório de qualidade identifica o que foi efetivamente executado e o que não foi testado. Arquivos `.ai`, `.fig` ou `.psd` não foram simulados renomeando outros formatos. O pacote não inclui avaliação de disponibilidade jurídica da marca nem autorização de registro.
