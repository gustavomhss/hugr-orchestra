function sha1Utf8(text) {
 const b=[];for(const c of text){const n=c.codePointAt(0);if(n<128)b.push(n);else if(n<2048)b.push(192|(n>>6),128|(n&63));else if(n<65536)b.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else b.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63));}
 const n=b.length,bit=n*8;b.push(128);while(b.length%64!==56)b.push(0);const hi=Math.floor(bit/4294967296),lo=bit>>>0;for(let s=24;s>=0;s-=8)b.push((hi>>>s)&255);for(let s=24;s>=0;s-=8)b.push((lo>>>s)&255);
 let h=[0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0],rot=(x,k)=>(x<<k)|(x>>>(32-k));
 for(let o=0;o<b.length;o+=64){const w=new Array(80);for(let i=0;i<16;i++)w[i]=((b[o+i*4]<<24)|(b[o+i*4+1]<<16)|(b[o+i*4+2]<<8)|b[o+i*4+3])>>>0;for(let i=16;i<80;i++)w[i]=rot(w[i-3]^w[i-8]^w[i-14]^w[i-16],1)>>>0;let[a,c,d,e,f]=h;for(let i=0;i<80;i++){let q,k;if(i<20){q=(c&d)|(~c&e);k=0x5a827999;}else if(i<40){q=c^d^e;k=0x6ed9eba1;}else if(i<60){q=(c&d)|(c&e)|(d&e);k=0x8f1bbcdc;}else{q=c^d^e;k=0xca62c1d6;}const t=(rot(a,5)+q+f+k+w[i])>>>0;f=e;e=d;d=rot(c,30)>>>0;c=a;a=t;}const x=[a,c,d,e,f];h=h.map((v,i)=>(v+x[i])>>>0);}
 return h.map(x=>x.toString(16).padStart(8,"0")).join("");
}
