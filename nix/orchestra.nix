{
  lib,
  stdenv,
  callPackage,
  bun ? callPackage ./bun.nix { },
  nodejs,
  sysctl,
  makeBinaryWrapper,
  models-dev,
  ripgrep,
  installShellFiles,
  versionCheckHook,
  writableTmpDirAsHomeHook,
  patchelf,
  apple-sdk,
  darwin,
  node_modules ? callPackage ./node_modules.nix { inherit bun; },
}:
let
  target = lib.removePrefix "bun-" bun.compileTarget;
in
assert lib.assertMsg (stdenv.buildPlatform.system == stdenv.hostPlatform.system)
  "Orchestra CLI artifacts require a matching native build platform";
stdenv.mkDerivation (finalAttrs: {
  pname = "orchestra";
  inherit (node_modules) version src;
  inherit node_modules;

  nativeBuildInputs = [
    bun
    nodejs
    installShellFiles
    makeBinaryWrapper
    writableTmpDirAsHomeHook
  ] ++ lib.optionals stdenv.hostPlatform.isLinux [ patchelf ]
    ++ lib.optionals stdenv.hostPlatform.isDarwin [ apple-sdk darwin.sigtool ];

  # stdenv supplies the native C compiler; apple-sdk supplies headers and
  # libSystem stubs for Bun FFI cc's variadic-openat shim on both Darwin CPUs.
  buildInputs = lib.optionals stdenv.hostPlatform.isDarwin [ apple-sdk ];

  configurePhase = ''
    runHook preConfigure
    cp -R ${finalAttrs.node_modules}/. .
    chmod -R u+w node_modules packages/*/node_modules
    patchShebangs node_modules packages/*/node_modules
    export BUN_INSTALL_CACHE_DIR=$(mktemp -d)
    runHook postConfigure
  '';

  env = {
    MODELS_DEV_API_JSON = "${models-dev}/dist/_api.json";
    ORCHESTRA_DISABLE_MODELS_FETCH = "1";
    ORCHESTRA_VERSION = finalAttrs.version;
    ORCHESTRA_CHANNEL = "prod";
  } // lib.optionalAttrs stdenv.hostPlatform.isDarwin {
    ORCHESTRA_ARTIFACT_DARWIN_SDK = apple-sdk.sdkroot;
    SDKROOT = apple-sdk.sdkroot;
    LIBRARY_PATH = "${apple-sdk.sdkroot}/usr/lib";
  };

  buildPhase = ''
    runHook preBuild
    bun --bun packages/cli/script/build.ts --target ${target} --skip-install
    bun --bun packages/cli/script/schema.ts schema.json
  '' + lib.optionalString stdenv.hostPlatform.isLinux ''
    # Bun normalizes the emitted interpreter. Patch before publication, so the
    # schema-1 digest describes runnable Nix bytes, not their unpatched ancestor.
    patchelf --set-interpreter "$(cat $NIX_CC/nix-support/dynamic-linker)" \
      --set-rpath "$(patchelf --print-rpath ${bun}/bin/bun)" \
      packages/cli/dist/cli-${target}/bin/orchestra
  '' + lib.optionalString stdenv.hostPlatform.isDarwin ''
    codesign --force --sign - packages/cli/dist/cli-${target}/bin/orchestra
  '' + ''
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/orchestra $out/bin
    # The leaf must be fresh: the reviewed producer admits/publishes it itself.
    bun --bun packages/cli/script/export-artifacts.ts \
      --dist packages/cli/dist --out "$out/share/orchestra/cli" \
      --version "${finalAttrs.version}" --target ${target}
    install -Dm644 schema.json $out/share/orchestra/schema.json
    makeWrapper "$out/share/orchestra/cli/orchestra-${target}" $out/bin/orchestra \
      --prefix PATH : ${lib.makeBinPath ([ ripgrep ] ++ lib.optional stdenv.hostPlatform.isDarwin sysctl)}
    runHook postInstall
  '';

  # No mutation of published executables: consumers verify their exact digests.
  dontStrip = true;
  dontPatchELF = true;

  postInstall = lib.optionalString (stdenv.buildPlatform.canExecute stdenv.hostPlatform) ''
    installShellCompletion --cmd orchestra \
      --bash <($out/bin/orchestra completion) \
      --zsh <(SHELL=/bin/zsh $out/bin/orchestra completion)
  '';

  nativeInstallCheckInputs = [ versionCheckHook writableTmpDirAsHomeHook ];
  doInstallCheck = true;
  versionCheckKeepEnvironment = [ "HOME" "ORCHESTRA_DISABLE_MODELS_FETCH" ];
  versionCheckProgramArg = "--version";

  passthru = {
    jsonschema = "${finalAttrs.finalPackage}/share/orchestra/schema.json";
    cliArtifacts = "${finalAttrs.finalPackage}/share/orchestra/cli";
    cliTarget = target;
    inherit bun;
    env = finalAttrs.env;
    validationStatus = "UNVALIDATED: native builds and dependency measurements pending";
  };

  meta = {
    description = "The open source coding agent";
    homepage = "https://opencode.ai";
    license = lib.licenses.mit;
    mainProgram = "orchestra";
    inherit (node_modules.meta) platforms;
  };
})
