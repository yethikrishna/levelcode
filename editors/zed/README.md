# LevelCode for Zed

Minimal Zed extension that registers a `/levelcode` slash command. The command
pipes its prompt argument to the LevelCode CLI (`levelcode -p "<prompt>"`) in the
current worktree root and inserts stdout as the response.

## Structure

```
editors/zed/
├── extension.toml        # Zed extension manifest (registers /levelcode slash command)
├── Cargo.toml            # Rust crate config (cdylib, links zed_extension_api)
├── README.md
└── src/
    └── levelcode.rs      # Extension + slash-command implementation
```

## Prerequisites

1. **Rust** toolchain (`cargo build`).
2. The **`levelcode` CLI** must be installed and available on `PATH`.

## Building and installing (for development)

```bash
cd editors/zed
cargo build --release
```

Zed expects the compiled dynamic library at a location it discovers via the
extension system. For local iteration, install the extension as a "dev extension"
from Zed's extension panel (point at `editors/zed/`).

## Usage

In any Zed buffer with an open worktree, open the command palette or assistant
panel and type:

```
/levelcode add unit tests for the auth module
```

The extension spawns the LevelCode CLI in the worktree root and inserts its
output as the slash-command result.

## Notes

- This is a *scaffold* — the real integration would stream incremental output,
  surface tool-call progress, and integrate with Zed's assistant-panel UI. The
  scaffold does a single blocking subprocess call and returns stdout.
- The binary name `levelcode` is hard-coded; adjust in `src/levelcode.rs` if
  your build uses a different name.
