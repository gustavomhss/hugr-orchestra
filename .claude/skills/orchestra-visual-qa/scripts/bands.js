(async () => {
  const blob = await (await fetch("/orchestra/mtn-src.jpg")).blob()
  const img = await createImageBitmap(blob)
  const W = 1416, H = 836
  const out = {}
  for (const blur of [8, 28]) {
    const c = new OffscreenCanvas(W, H), x = c.getContext("2d")
    const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s
    x.filter = `blur(${blur}px)`
    // pad by mirroring the edge so the blur does not pull in transparent pixels
    x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
    const d = x.getImageData(0, 0, W, H).data
    const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    const bands = []
    for (let b = 0; b < 10; b++) {
      let lo = null, hi = null
      for (let y = Math.floor(b * H / 10); y < Math.floor((b + 1) * H / 10); y++)
        for (let xx = blur * 2; xx < W - blur * 2; xx++) {
          if (y < blur * 2 || y >= H - blur * 2) continue
          const i = (y * W + xx) * 4
          if (lo === null || lum(i) < lum(lo)) lo = i
          if (hi === null || lum(i) > lum(hi)) hi = i
        }
      bands.push(lo === null ? null : [[d[lo], d[lo + 1], d[lo + 2]], [d[hi], d[hi + 1], d[hi + 2]]])
    }
    out[blur] = bands
  }
  return JSON.stringify(out)
})()
