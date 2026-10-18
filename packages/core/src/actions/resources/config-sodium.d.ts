// Narrow declaration for the pinned lazy runtime dependency; no crypto implementation lives here.
declare module "libsodium-wrappers" {
  const sodium: {
    readonly ready: Promise<void>
    readonly crypto_box_PUBLICKEYBYTES: number
    readonly base64_variants: { readonly ORIGINAL: number }
    readonly from_base64: (value: string, variant: number) => Uint8Array
    readonly to_base64: (value: Uint8Array, variant: number) => string
    readonly crypto_box_seal: (value: Uint8Array, publicKey: Uint8Array) => Uint8Array
    readonly memzero: (value: Uint8Array) => void
    readonly crypto_box_keypair: () => { publicKey: Uint8Array; privateKey: Uint8Array }
    readonly crypto_box_seal_open: (value: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array) => Uint8Array
  }
  export default sodium
}
