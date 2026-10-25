import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
w, h = 960, 600
im = Image.new("RGB", (w*2, h*((len(files)+1)//2)))
for i, f in enumerate(files):
    im.paste(Image.open(f).convert("RGB").resize((w, h)), ((i%2)*w, (i//2)*h))
im.save(out)
