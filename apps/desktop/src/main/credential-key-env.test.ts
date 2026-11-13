import { expect, test } from "bun:test"
import { credentialKeyEnv } from "./credential-key-env"

const home = "/Users/owner"
const file = "/Users/owner/.local/share/orchestra/credential.key"

test("an unsigned macOS build with a key file does not call the keychain", () => {
  expect(
    credentialKeyEnv({
      platform: "darwin",
      signed: false,
      dataHome: undefined,
      home,
      exists: (path) => path === file,
    }),
  ).toEqual({ ORCHESTRA_CREDENTIAL_KEY_FILE: file })
})

test("a signed macOS build still uses the keychain", () => {
  expect(
    credentialKeyEnv({
      platform: "darwin",
      signed: true,
      dataHome: undefined,
      home,
      exists: () => true,
    }),
  ).toEqual({})
})

test("an unsigned build with no key file does not invent one", () => {
  expect(
    credentialKeyEnv({
      platform: "darwin",
      signed: false,
      dataHome: undefined,
      home,
      exists: () => false,
    }),
  ).toEqual({})
})

test("a custom data home is the key file location", () => {
  const custom = "/data/orchestra/credential.key"
  expect(
    credentialKeyEnv({
      platform: "darwin",
      signed: false,
      dataHome: "/data",
      home,
      exists: (path) => path === custom,
    }),
  ).toEqual({ ORCHESTRA_CREDENTIAL_KEY_FILE: custom })
})
