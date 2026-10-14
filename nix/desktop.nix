{
  lib,
  stdenv,
  callPackage,
  bun ? callPackage ./bun.nix { },
  nodejs,
  python3,
  darwin,
  electron ? callPackage ./electron.nix { },
  wrapGAppsHook3,
  glib,
  gtk3,
  gtk4,
  makeWrapper,
  writableTmpDirAsHomeHook,
  autoPatchelfHook,
  copyDesktopItems,
  makeDesktopItem,
  ripgrep,
  sysctl,
  xcbuild,
  cctools,
  orchestra,
  omni ? orchestra.omni,
}:
let
  resources =
    if stdenv.hostPlatform.isDarwin then
      "/Applications/HuGR Orchestra.app/Contents/Resources"
    else
      "/opt/orchestra-desktop/resources";
in
assert lib.assertMsg (stdenv.buildPlatform.system == stdenv.hostPlatform.system)
  "Orchestra Desktop requires a matching native build platform";
stdenv.mkDerivation (finalAttrs: {
  pname = "orchestra-desktop";
  inherit (orchestra)
    version
    src
    node_modules
    ;

  nativeBuildInputs = [
    bun
    nodejs
    makeWrapper
    python3
    writableTmpDirAsHomeHook
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [
    autoPatchelfHook
    copyDesktopItems
    wrapGAppsHook3
  ]
  ++ lib.optionals stdenv.hostPlatform.isDarwin [
    # Ad-hoc sign the .app: --config.mac.identity=null below skips signing.
    darwin.autoSignDarwinBinariesHook
    # Desktop prebuild also signs admitted CLI resources before app packaging.
    darwin.sigtool
    sysctl
    # gyp on Darwin needs xcodebuild/xcrun: repair-host-prebuilds.py below and electron-builder's
    # beforePack (prepareTreeSitterPrebuilds builds the core tree-sitter binding) both run node-gyp.
    xcbuild
    # node-gyp's static archive step on Darwin calls libtool.
    cctools
  ];

  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    (lib.getLib stdenv.cc.cc)
    glib
    gtk3
    gtk4
  ];

  desktopItems = lib.optional stdenv.hostPlatform.isLinux (makeDesktopItem {
    name = "ai.hugr.orchestra";
    desktopName = "HuGR Orchestra";
    exec = "orchestra-desktop %U";
    icon = "ai.hugr.orchestra";
    startupWMClass = "ai.hugr.orchestra";
    categories = [ "Development" ];
  });

  env = orchestra.env // {
    ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
    ORCHESTRA_CLI_PREBUILT_DIR = orchestra.cliArtifacts;
    CSC_IDENTITY_AUTO_DISCOVERY = "false";
    # beforePack compiles the core tree-sitter binding with the lockfile node-gyp against these headers.
    npm_config_nodedir = "${nodejs}";
  };

  preBuild = ''
    cp -r "${electron.dist}" $HOME/.electron-dist
    chmod -R u+w $HOME/.electron-dist

    # Prod prebuild (stage-omni.ts) requires OMNI_ARTIFACTS: a directory with
    # hugr_omni.node beside the supervisor. A writable copy keeps later packaging
    # and Darwin ad hoc signing from inheriting read-only store modes.
    mkdir -p "$TMPDIR/omni-artifacts"
    cp ${omni}/hugr_omni.node ${omni}/hugr-omni-supervisor "$TMPDIR/omni-artifacts/"
    chmod u+w "$TMPDIR/omni-artifacts/hugr_omni.node" "$TMPDIR/omni-artifacts/hugr-omni-supervisor"
    export OMNI_ARTIFACTS="$TMPDIR/omni-artifacts"

    cp -R ${finalAttrs.node_modules}/. .
    test -d node_modules
    for directory in node_modules packages/*/node_modules packages/*/*/node_modules modules/*/node_modules modules/*/*/node_modules tooling/*/node_modules; do
      test -d "$directory" || continue
      chmod -R u+w "$directory"
      patchShebangs "$directory"
    done
  '' + lib.optionalString stdenv.hostPlatform.isLinux ''
    # Bun installs both libc variants; Electron here uses glibc. Prune only the
    # locked unsupported optional leaves before the collector creates app.asar.
    python3 ${./scripts/prune-desktop-addons.py} "$PWD" '${stdenv.hostPlatform.system}'
  '' + ''
    # node-gyp-build packages (tree-sitter grammars) ship every platform's prebuilds;
    # only the host's can load, so the others must not reach app.asar.unpacked.
    python3 ${./scripts/prune-foreign-prebuilds.py} "$PWD" '${stdenv.hostPlatform.system}'
    # Some upstream host prebuilds are another CPU's binary (tree-sitter-typescript
    # 0.23.2 ships x86-64 ELF as linux-arm64). Rebuild those offline from binding.gyp
    # with npm's bundled node-gyp against these Node headers (N-API is ABI-stable).
    python3 -B ${./scripts/repair-host-prebuilds.py} \
      "$PWD" '${stdenv.hostPlatform.system}' ${nodejs} \
      ${nodejs}/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js
  '';

  buildPhase = ''
    runHook preBuild

    cd packages/desktop

    # electron-vite SSR bundling reached Node's 2 GiB V8 heap limit.
    # Give this build a bounded heap; packaged runtime settings are unchanged.
    NODE_OPTIONS="--max-old-space-size=4096" bun run build
    ./node_modules/.bin/electron-builder --dir \
      --${if stdenv.hostPlatform.isAarch64 then "arm64" else "x64"} \
      --publish never \
      --config electron-builder.config.ts \
      --config.mac.identity=null \
      --config.mac.notarize=false \
      --config.npmRebuild=false \
      --config.nodeGypRebuild=false \
      --config.buildDependenciesFromSource=false \
      --config.electronVersion=${electron.version} \
      --config.electronDist="$HOME/.electron-dist"

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
  ''
  + lib.optionalString stdenv.hostPlatform.isDarwin ''
    mkdir -p $out/Applications
    mv dist/mac*/*.app $out/Applications
    makeWrapper "$out/Applications/HuGR Orchestra.app/Contents/MacOS/HuGR Orchestra" $out/bin/orchestra-desktop \
      --prefix PATH : ${lib.makeBinPath [ orchestra ripgrep sysctl ]}
  ''
  + lib.optionalString stdenv.hostPlatform.isLinux ''
    mkdir -p $out/opt/orchestra-desktop
    # Launch this packaged Electron, so process.resourcesPath resolves every
    # extraResource (CLI/icons/playbooks/helpers), not the toolchain's resources.
    cp -r dist/linux*-unpacked/. $out/opt/orchestra-desktop/
    install -Dm644 resources/icons/32x32.png \
      "$out/share/icons/hicolor/32x32/apps/ai.hugr.orchestra.png"
    install -Dm644 resources/icons/64x64.png \
      "$out/share/icons/hicolor/64x64/apps/ai.hugr.orchestra.png"
    install -Dm644 resources/icons/128x128.png \
      "$out/share/icons/hicolor/128x128/apps/ai.hugr.orchestra.png"
    install -Dm644 resources/icons/256x256.png \
      "$out/share/icons/hicolor/256x256/apps/ai.hugr.orchestra.png"
    install -Dm644 resources/icons/512x512.png \
      "$out/share/icons/hicolor/512x512/apps/ai.hugr.orchestra.png"
    install -Dm644 resources/ai.hugr.orchestra.metainfo.xml \
      "$out/share/metainfo/ai.hugr.orchestra.metainfo.xml"
  ''
  + ''
    runHook postInstall
  '';

  # electron.dist and the admitted CLI are already patched. Restrict subsequent
  # native dependency repair to unpacked addons; never rewrite hashed CLI bytes.
  dontAutoPatchelf = true;
  dontWrapGApps = true;
  dontStrip = true;
  dontPatchELF = true;
  preFixup = lib.optionalString stdenv.hostPlatform.isLinux ''
    addAutoPatchelfSearchPath ${electron.dist}
    autoPatchelf $out/opt/orchestra-desktop/resources/app.asar.unpacked
    makeWrapper $out/opt/orchestra-desktop/ai.hugr.orchestra $out/bin/orchestra-desktop \
      --inherit-argv0 \
      "''${gappsWrapperArgs[@]}" \
      --prefix PATH : ${lib.makeBinPath [ orchestra ripgrep ]} \
      --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform-hint=auto --enable-features=WaylandWindowDecorations --enable-wayland-ime=true}}"
  '';

  nativeInstallCheckInputs = [ bun writableTmpDirAsHomeHook ];
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    bun --bun --eval '
      const { verifyPackagedCli } = await import("./scripts/cli-packaging.ts")
      await verifyPackagedCli(process.env.out + "${resources}/cli", "${if stdenv.hostPlatform.isDarwin then "darwin" else "linux"}", "${if stdenv.hostPlatform.isAarch64 then "arm64" else "x64"}", "${finalAttrs.version}")
    '
  '' + (if stdenv.hostPlatform.isDarwin then ''
    # autoSignDarwinBinariesHook re-signs Resources/omni in place: presence only.
    test -s "$out${resources}/omni/hugr_omni.node"
    test -x "$out${resources}/omni/hugr-omni-supervisor"
  '' else ''
    cmp ${omni}/hugr_omni.node "$out${resources}/omni/hugr_omni.node"
    cmp ${omni}/hugr-omni-supervisor "$out${resources}/omni/hugr-omni-supervisor"
  '') + ''
    runHook postInstallCheck
  '';

  passthru = {
    inherit electron omni;
    cliArtifacts = orchestra.cliArtifacts;
    validationStatus = "UNVALIDATED: native package and Electron/addon ABI checks pending";
  };

  meta = {
    description = "Orchestra Desktop App";
    mainProgram = "orchestra-desktop";
    inherit (orchestra.meta) homepage license platforms;
  };
})
