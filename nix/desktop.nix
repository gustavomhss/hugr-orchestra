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
  orchestra,
}:
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
    writableTmpDirAsHomeHook
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [
    python3
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
  };

  preBuild = ''
    cp -r "${electron.dist}" $HOME/.electron-dist
    chmod -R u+w $HOME/.electron-dist

    cp -R ${finalAttrs.node_modules}/. .
    chmod -R u+w node_modules packages/*/node_modules
    patchShebangs node_modules
    patchShebangs packages/*/node_modules
  '' + lib.optionalString stdenv.hostPlatform.isLinux ''
    # Bun installs both libc variants; Electron here uses glibc. Prune only the
    # locked unsupported optional leaves before the collector creates app.asar.
    python3 ${./scripts/prune-desktop-addons.py} "$PWD" '${stdenv.hostPlatform.system}'
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
      await verifyPackagedCli(process.env.out + "${if stdenv.hostPlatform.isDarwin then "/Applications/HuGR Orchestra.app/Contents/Resources/cli" else "/opt/orchestra-desktop/resources/cli"}", "${if stdenv.hostPlatform.isDarwin then "darwin" else "linux"}", "${if stdenv.hostPlatform.isAarch64 then "arm64" else "x64"}", "${finalAttrs.version}")
    '
    runHook postInstallCheck
  '';

  passthru = {
    inherit electron;
    cliArtifacts = orchestra.cliArtifacts;
    validationStatus = "UNVALIDATED: native package and Electron/addon ABI checks pending";
  };

  meta = {
    description = "Orchestra Desktop App";
    mainProgram = "orchestra-desktop";
    inherit (orchestra.meta) homepage license platforms;
  };
})
