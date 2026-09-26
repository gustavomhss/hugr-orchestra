"""Bounded structural decode of screenshot PNGs (8-bit noninterlaced grey/RGB/GA/RGBA).
Unsupported formats fail closed: capture PNG through Playwright/Electron, do not change
product dependencies. Valid bytes do not prove screenshot provenance or visual quality.
"""
import struct,zlib
from pathlib import Path

def decode_png(path):
    path=Path(path)
    if path.stat().st_size>32*1024*1024:raise ValueError('PNG compressed size exceeds 32 MiB')
    data=path.read_bytes()
    if data[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('invalid PNG signature')
    offset=8;w=h=bpp=None;payload=bytearray();done=False;ended_idat=False;seen_idat=False;chunks=0
    while offset<len(data):
        chunks+=1
        if chunks>10000 or offset+12>len(data):raise ValueError('truncated/excessive PNG chunks')
        n=struct.unpack('>I',data[offset:offset+4])[0];kind=data[offset+4:offset+8];end=offset+12+n
        if end>len(data):raise ValueError('truncated PNG payload')
        body=data[offset+8:offset+8+n];crc=struct.unpack('>I',data[offset+8+n:end])[0]
        if zlib.crc32(kind+body)&0xffffffff!=crc:raise ValueError('PNG CRC mismatch')
        if chunks==1 and kind!=b'IHDR':raise ValueError('PNG must begin with IHDR')
        if kind==b'IHDR':
            if w is not None or n!=13:raise ValueError('invalid PNG IHDR')
            w,h,depth,color,comp,filt,interlace=struct.unpack('>IIBBBBB',body)
            if not 1<=w<=8192 or not 1<=h<=8192:raise ValueError('PNG dimensions out of bounds')
            if depth!=8 or color not in (0,2,4,6) or comp or filt or interlace:raise ValueError('unsupported screenshot PNG encoding')
            bpp={0:1,2:3,4:2,6:4}[color]
            if h*(1+w*bpp)>128*1024*1024:raise ValueError('PNG decoded size exceeds limit')
        elif kind==b'IDAT':
            if ended_idat:raise ValueError('noncontiguous PNG IDAT')
            seen_idat=True;payload.extend(body)
        elif kind==b'IEND':
            if n or not seen_idat or end!=len(data):raise ValueError('invalid PNG end')
            done=True;break
        elif kind[0]&32==0 and kind!=b'PLTE':raise ValueError('unsupported critical PNG chunk')
        if seen_idat and kind not in (b'IDAT',b'IEND'):ended_idat=True
        offset=end
    if not done or w is None:raise ValueError('PNG missing complete image/end')
    expected=h*(1+w*bpp);d=zlib.decompressobj()
    raw=d.decompress(bytes(payload),expected+1)
    if len(raw)!=expected or not d.eof or d.unused_data or d.unconsumed_tail:raise ValueError('PNG decompressed payload length mismatch')
    stride=1+w*bpp
    # All filter types 0..4 are invertible over 8-bit bytes; verifying each row and
    # exact decompressed row lengths proves complete raster data, not aesthetics.
    if any(raw[y*stride]>4 for y in range(h)):raise ValueError('invalid PNG row filter')
    return {'width':w,'height':h,'channels':bpp,'decoded_bytes':w*h*bpp}
