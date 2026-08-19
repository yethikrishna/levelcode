use std::process::Command;
use zed_extension_api as zed;

/// LevelCode Zed extension.
///
/// Registers a `/levelcode` slash command that pipes the user's prompt to the
/// LevelCode CLI binary and returns the output as a completion string.
struct LevelCodeExtension;

impl zed::Extension for LevelCodeExtension {
    fn new() -> Self {
        LevelCodeExtension
    }
}

zed::register_extension!(LevelCodeExtension);

/// Slash command handler: `/levelcode <prompt>`
///
/// Executes `levelcode -p "<prompt>"` in the current worktree and returns
/// stdout as the slash command result. In a production build this would
/// stream output and attach to Zed's assistant panel, but for the scaffold
/// we do a single blocking invocation.
#[zed::slash_command]
fn levelcode_slash_command(
    args: &[String],
    worktree: &zed::Worktree,
) -> Result<zed::SlashCommandOutput, String> {
    let prompt = args.join(" ");
    if prompt.trim().is_empty() {
        return Err("Please provide a prompt for LevelCode.".to_string());
    }

    let cwd = worktree.root_path();

    let output = Command::new("levelcode")
        .arg("-p")
        .arg(&prompt)
        .current_dir(cwd)
        .output()
        .map_err(|e| {
            format!(
                "Failed to run `levelcode` CLI: {}. Is it installed and on your PATH?",
                e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "LevelCode exited with {}:\n{}{}",
            output.status, stderr, stdout
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout).to_string();

    Ok(zed::SlashCommandOutput {
        text,
        // No range replacement — treat the whole response as inserted text.
        sections: vec![],
    })
}
