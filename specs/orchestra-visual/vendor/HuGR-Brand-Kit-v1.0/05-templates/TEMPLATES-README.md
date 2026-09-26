# Templates de comunicação

`HuGR-Presentation-Template.pptx`: seis layouts 16:9, com textos e formas editáveis. O logo nas slides é um PNG de alta resolução derivado do master; os SVGs vetoriais estão em `01-logos/svg`. Fontes: Inter / Inter Display. Substitua os textos entre colchetes; não há resultados, métricas ou contatos inventados.

`HuGR-Letterhead-Template.docx`: documento A4 com cabeçalho, estilos, metadados de trabalho e rodapé. Edite o conteúdo sem alterar a proporção do logo.

`business-card-front/back.svg` e PDF: corte 90 × 50 mm, documento 96 × 56 mm incluindo 3 mm de sangria. Área de corte: x=30..930, y=30..530 no SVG. O verso contém campos de exemplo. Confira os dados e o perfil de cor antes de enviar à gráfica.

`make-email-signature.py`: use Python 3 para gerar a assinatura com seus dados reais. O logo deve ser PNG servido por HTTPS; não use SVG ou imagem base64 em clientes de e-mail. Exemplo de argumentos: `--name "Nome" --role "Cargo" --email "endereço" --logo-url "URL HTTPS real do PNG" --output signature.html`. `--website` é opcional. A prévia local não é uma assinatura publicada.

Capas em `03-social` são arquivos finalizados, com apenas a marca. As dimensões estão nos nomes ou no viewBox. Verifique o recorte da plataforma ao publicar: avatares e interfaces podem cobrir partes da capa.
