# Aplicação e fontes técnicas

O desenho principal é a referência aprovada nesta conversa. Cores de UI, versões inversas, limites mínimos e layouts são decisões operacionais propostas para este kit, não uma alteração da composição principal.

## Hierarquia e tamanho

O símbolo principal é recomendado a partir de 24 px. Para 16 px, use o favicon flat fornecido. Marca empilhada com assinatura: 320 px de largura; horizontal com assinatura: 480 px. Abaixo disso, prefira composições compactas sem assinatura. Os tamanhos evitam tratar uma linha minúscula como texto legível.

Defina x como o diâmetro da cabeça azul (aproximadamente 23,8% da largura do símbolo). Preserve 1x de área livre ao redor da arte. Exceção compacta de UI: 0,5x, sem encostar em outras marcas. O padding do arquivo não substitui a área livre externa de layout.

## Variantes

Primary mantém as hastes escuras e os gradientes azuis. Inverse preserva a geometria e usa hastes claras para aplicação em fundo escuro. Flat remove a iluminação, não as formas. Mono elimina a distinção cromática da fita e preserva a silhueta; use somente quando a reprodução limitar cores.

## Cor e interface

O contraste foi calculado pela luminância relativa sRGB e está em `10-quality/contrast-report.json`. A referência de 4,5:1 para texto normal provém de WCAG 2.2 SC 1.4.3. Testar pares não é certificar acessibilidade de um produto inteiro; estados, tamanhos, foco, formulários e conteúdo ainda precisam ser avaliados na implementação.

Fonte: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

## Ícones

O master maskable tem fundo opaco e mantém a marca dentro da área circular segura de raio 40% da imagem. A arte ocupa 54% do lado para não cortar os cantos do H em máscaras circulares. Os ícones comuns são maiores, pois têm outra finalidade.

Fonte: https://www.w3.org/TR/appmanifest/#icon-masks

## Fontes e código

Inter: https://rsms.me/inter/ — obtenção e licença no projeto oficial. A identidade não depende de um download de fonte para renderizar o logo.
React / atributos DOM: https://react.dev/reference/react-dom/components/common

O componente usa `<img>` em vez de SVG inline para evitar colisões de IDs de gradientes entre instâncias. Não inclua scripts de terceiros para mostrar a marca. O CSS não faz chamadas de rede.

## Conteúdo e voz

Escreva a marca como HuGR e o descritor como Human Guardrail. Use linguagem direta, competente e humana. Demonstre qualidade por decisões e evidências; evite promessas absolutas de segurança, conformidade ou desempenho sem comprovação. Não adicione slogans, selos de certificação ou marcas de parceiros aos masters.
