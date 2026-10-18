// Independent inert ELF fixture for admission and pre-load ordering, not N-API.
export function parserElf(libc: "musl" | "glibc", machine = 62) {
  const bytes = Buffer.alloc(512);
  Buffer.from("7f454c46020101", "hex").copy(bytes);
  bytes.writeUInt16LE(3, 16); bytes.writeUInt16LE(machine, 18); bytes.writeUInt32LE(1, 20);
  bytes.writeBigUInt64LE(64n, 32); bytes.writeUInt16LE(56, 54); bytes.writeUInt16LE(2, 56);
  bytes.writeUInt32LE(1, 64); bytes.writeBigUInt64LE(512n, 96); bytes.writeBigUInt64LE(512n, 104);
  bytes.writeUInt32LE(2, 120); bytes.writeBigUInt64LE(176n, 128); bytes.writeBigUInt64LE(176n, 136);
  bytes.writeBigUInt64LE(64n, 152); bytes.writeBigUInt64LE(64n, 160);
  const names = Buffer.from(libc === "musl" ? `libc.musl-${machine === 183 ? "aarch64" : "x86_64"}.so.1\0` : "libc.so.6\0");
  names.copy(bytes, 352);
  ;[[5n, 352n], [10n, BigInt(names.length)], [1n, 0n], [0n, 0n]].forEach(([tag, value], i) => {
    bytes.writeBigInt64LE(tag, 176 + i * 16); bytes.writeBigUInt64LE(value, 184 + i * 16);
  });
  return bytes;
}
