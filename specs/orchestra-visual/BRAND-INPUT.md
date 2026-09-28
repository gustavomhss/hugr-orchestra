# Marca e assets visuais — localização atual

Os insumos estão neste repositório, em `specs/orchestra-visual/`. Não é necessário obter ZIP ou imagem pelo chat. Leia [design/README.md](design/README.md) para as peças separadas e [BRAND-INTEGRATION.md](BRAND-INTEGRATION.md) para a integração oficial.

O kit inteiro permanece em `vendor/HuGR-Brand-Kit-v1.0/`, intacto. Os símbolos de primeira integração estão em `design/brand/hugr-symbol-inverse.svg` (dark) e `hugr-symbol-primary.svg` (light), com hashes e destinos em `design/ASSETS.json` e `BRAND-ASSETS.json`. O favicon é condicional a um consumidor existente. Não reexportar nem recolorir a arte; Orchestra continua o nome do produto, separado do símbolo.

A paisagem agora existe: `design/landscape/sidebar-mountains.webp`, com PNG, máscara e proveniência ao lado. Ela foi extraída do master; regiões ocultas do céu foram reconstruídas e estão identificadas. Não é um asset original fornecido pelo Zen nem pertence ao kit HuGR. S05 copia e valida no aplicativo; o arquivo existir aqui não significa integração concluída.

A aparência inspirada no Zen está separada em `design/zen/`: tokens, medições e CSS de chrome, controles e estados. Esses materiais não substituem a marca nem permitem importar o tema corporativo HuGR sobre a identidade grafite aprovada. Reutilizar Solid, o provider e o sprite de ícones existentes.

O master continua `reference/approved.png`, SHA-256 `e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d`. Guias e resultados antigos em `reviews/` são históricos; nenhuma frase antiga de falta de publicação revoga os arquivos atuais. O frontend e seus benchmarks só ficam concluídos mediante as provas do plano.
