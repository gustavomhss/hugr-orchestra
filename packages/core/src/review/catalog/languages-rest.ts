// Remaining language entries (design §7.4). Spread into entries.ts. Detect dotnet and swift through project manifests.
export const languagesRest = [
  {
    id: "rust",
    detection: {
      manifests: ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml"],
      extensions: [".rs"],
      absent: ["BUILD.bazel", "BUCK", "flake.nix"],
    },
    node: "team-stack-compiled-rust",
  },
  {
    id: "jvm",
    detection: {
      manifests: ["gradlew", "settings.gradle", "settings.gradle.kts", "pom.xml", "mvnw", ".java-version"],
      extensions: [".java", ".kt", ".kts"],
      absent: [],
    },
    node: "team-stack-compiled-jvm",
  },
  {
    id: "native",
    detection: {
      manifests: ["CMakeLists.txt", "meson.build", "Makefile", "compile_commands.json"],
      extensions: [".c", ".cc", ".cpp", ".h", ".hpp"],
      absent: [],
    },
    node: "team-stack-compiled-native",
  },
  {
    id: "dotnet",
    detection: {
      manifests: ["*.csproj", "*.fsproj", "*.vbproj"],
      extensions: [],
      absent: [],
    },
    node: "team-stack-compiled-dotnet",
  },
  {
    id: "swift",
    detection: {
      manifests: ["Package.swift"],
      extensions: [],
      absent: [],
    },
    node: "team-stack-compiled-swift",
  },
] as const
