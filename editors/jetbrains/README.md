# LevelCode for JetBrains IDEs

Minimal IntelliJ Platform plugin that provides a tool window and action for invoking the LevelCode CLI from within JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, GoLand, etc.).

## Structure

```
editors/jetbrains/
├── build.gradle.kts              # Gradle build config (Kotlin DSL, IntelliJ plugin)
├── settings.gradle.kts
├── gradle.properties
├── README.md
└── src/main/
    ├── kotlin/ai/levelcode/plugin/
    │   ├── LevelCodePlugin.kt         # Action registration ("Ask LevelCode")
    │   ├── LevelCodeCliRunner.kt      # Subprocess wrapper around the `levelcode` binary
    │   └── LevelCodeToolWindowFactory.kt  # Tool window panel with prompt input
    └── resources/
        ├── META-INF/plugin.xml        # Plugin descriptor
        └── icons/levelcode.svg        # Plugin icon
```

## Prerequisites

1. **JDK 17** — required by the IntelliJ Platform (2024.1 line).
2. The **`levelcode` CLI** must be installed and on your `PATH` so the plugin can invoke it as a subprocess.

## Building

```bash
cd editors/jetbrains
./gradlew buildPlugin
```

The built plugin zip is placed in `build/distributions/`.

## Running in a sandbox IDE

```bash
./gradlew runIde
```

This launches a fresh IntelliJ instance with the plugin installed. Use the "LevelCode" tool
window (right-hand sidebar) or **Tools → Ask LevelCode** to invoke the CLI.

## Notes

- This is a *scaffold* — the tool window pipes prompts directly to the CLI binary and captures
  stdout. A production version would stream output incrementally, support authenticated sessions,
  and provide richer UI for task DAG inspection, handoff management, etc.
- The `LevelCodeCliRunner` expects a CLI binary named `levelcode`. Adjust the `CLI_BINARY` constant
  in `LevelCodeCliRunner.kt` if your binary has a different name or path.
