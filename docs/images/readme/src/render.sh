#!/bin/sh
# Renders each diagram in src/ to ../<name>-dark.png and ../<name>-light.png at 2x with headless Chrome,
# sized to the canvas, then quantizes the PNG to keep the README light.
# Usage: sh docs/images/readme/src/render.sh [name...]
set -e
dir=$(cd "$(dirname "$0")" && pwd)
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
names=${*:-$(cd "$dir" && ls *.html | sed 's/\.html$//')}
for name in $names; do
  height=$("$chrome" --headless=new --disable-gpu --window-size=1200,900 --virtual-time-budget=3000 \
    --dump-dom "file://$dir/$name.html" 2>/dev/null | sed -n 's:.*<title>\([0-9]*\)</title>.*:\1:p' | head -1)
  for theme in dark light; do
    out="$dir/../$name-$theme.png"
    "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
      --window-size=1200,"${height:-900}" --virtual-time-budget=3000 \
      --screenshot="$out" "file://$dir/$name.html#$theme" >/dev/null 2>&1
    python3 -c "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[1], optimize=True)" "$out"
  done
done
