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
  python3,
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
  ] ++ lib.optionals stdenv.hostPlatform.isLinux [ patchelf python3 ]
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
  '' + lib.optionalString stdenv.hostPlatform.isLinux ''
    # Bun 1.3.14 grows the first writable PT_LOAD. Nix's loader metadata must
    # remain read-only so the payload grows its real .bun segment, not PHDR/.interp.
    python3 ${./scripts/prepare-bun-template.py} ${bun}/bin/bun \
      "$BUN_INSTALL_CACHE_DIR/native-bun-template" '${stdenv.hostPlatform.system}'
    test "$("$BUN_INSTALL_CACHE_DIR/native-bun-template" --version)" = '${bun.version}'
    ln -s "$BUN_INSTALL_CACHE_DIR/native-bun-template" packages/cli/bun-${target}-v${bun.version}
  '' + lib.optionalString stdenv.hostPlatform.isDarwin ''
    ln -s ${bun}/bin/bun packages/cli/bun-${target}-v${bun.version}
  '' + ''
    # Bun 1.3.14's automatic Nix-host detection can miss relocated ELF metadata.
    # Preserve the selected Nix compiler's interpreter, then verify emitted paths below.
    ${lib.optionalString stdenv.hostPlatform.isLinux "BUN_DEBUG_FORCE_NIX_HOST=1 "}${if stdenv.hostPlatform.isLinux then "\"$BUN_INSTALL_CACHE_DIR/native-bun-template\"" else "bun"} --bun packages/cli/script/build.ts --target ${target} --skip-install
    bun --bun packages/cli/script/schema.ts schema.json
  '' + lib.optionalString stdenv.hostPlatform.isLinux ''
    # Bun's Nix-host path can preserve its loader metadata. Rewriting compiled
    # sections aborts in patchelf; require the emitted native paths before publication.
    cli="packages/cli/dist/cli-${target}/bin/orchestra"
    interpreter="$(cat "$NIX_CC/nix-support/dynamic-linker")"
    # A successful empty RPATH is valid when the native compiler also has none.
    # Query failures must never masquerade as two matching empty values.
    rpath="$(patchelf --print-rpath ${bun}/bin/bun)" || {
      printf 'NIX_DISTRIBUTION_FAILURE:COMPILER_RPATH_READ_FAILED\n' >&2
      exit 1
    }
    compilerInterpreter="$(patchelf --print-interpreter ${bun}/bin/bun)"
    cliInterpreter="$(patchelf --print-interpreter "$cli")"
    cliRpath="$(patchelf --print-rpath "$cli")" || {
      printf 'NIX_DISTRIBUTION_FAILURE:CLI_RPATH_READ_FAILED\n' >&2
      exit 1
    }
    compilerNeeded="$(patchelf --print-needed ${bun}/bin/bun)" || {
      printf 'NIX_DISTRIBUTION_FAILURE:COMPILER_NEEDED_READ_FAILED\n' >&2
      exit 1
    }
    cliNeeded="$(patchelf --print-needed "$cli")" || {
      printf 'NIX_DISTRIBUTION_FAILURE:CLI_NEEDED_READ_FAILED\n' >&2
      exit 1
    }
    printf 'CLI_NATIVE_LOADER:expected=%s compiler=%s emitted=%s compilerRpath=%s emittedRpath=%s\n' \
      "$interpreter" "$compilerInterpreter" "$cliInterpreter" "$rpath" "$cliRpath"
    [[ -n "$interpreter" &&
      "$compilerInterpreter" == "$interpreter" &&
      "$cliInterpreter" == "$interpreter" &&
      "$cliRpath" == "$rpath" && "$cliNeeded" == "$compilerNeeded" ]] || {
      printf 'NIX_DISTRIBUTION_FAILURE:CLI_NATIVE_LOADER_MISMATCH\n' >&2
      exit 1
    }
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
    $out/bin/orchestra --completions bash > orchestra.bash
    $out/bin/orchestra --completions zsh > _orchestra
    test -s orchestra.bash
    test -s _orchestra
    installShellCompletion --cmd orchestra \
      --bash orchestra.bash --zsh _orchestra
  '';

  nativeInstallCheckInputs = [ versionCheckHook writableTmpDirAsHomeHook ];
  doInstallCheck = true;
  versionCheckKeepEnvironment = [ "HOME" "ORCHESTRA_DISABLE_MODELS_FETCH" ];
  versionCheckProgramArg = "--version";
  postInstallCheck = ''
    bun --bun packages/cli/script/schema.ts schema-installcheck.json
    cmp schema-installcheck.json $out/share/orchestra/schema.json
    bun --bun --eval '
      const { verifyCliArtifact } = await import("./packages/desktop/src/main/cli-artifacts.ts")
      const artifact = await verifyCliArtifact(process.env.out + "/share/orchestra/cli", "${target}")
      if (artifact.version !== "${finalAttrs.version}") throw new Error("NIX_CLI_ARTIFACT_VERSION_MISMATCH")
    '
  '';

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
