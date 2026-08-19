package ai.levelcode.plugin

import com.intellij.openapi.project.Project
import java.io.File

/**
 * Thin wrapper around the LevelCode CLI executable. Invokes the CLI
 * as a subprocess in the project directory and captures its output.
 */
object LevelCodeCliRunner {

    private const val CLI_BINARY = "levelcode"

    /**
     * Run the LevelCode CLI against a prompt in the given working directory.
     * Blocks until the CLI process completes — call from a background thread
     * (e.g., SwingWorker.doInBackground).
     *
     * @param cwd Project working directory
     * @param prompt User prompt to send to the CLI
     * @return Captured stdout from the CLI, or an error message
     */
    fun execute(cwd: String, prompt: String): String {
        return runCatching {
            val process = ProcessBuilder(CLI_BINARY, "-p", prompt)
                .directory(File(cwd))
                .redirectErrorStream(true)
                .start()

            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()

            if (exitCode == 0) output
            else "LevelCode exited with code $exitCode:\n$output"
        }.getOrElse { err ->
            val hint = if (err.message?.contains("Cannot run program", ignoreCase = true) == true) {
                "\n\n(Hint: make sure the `levelcode` CLI is installed and on your PATH.)"
            } else ""
            "Failed to run LevelCode: ${err.message}$hint"
        }
    }

    /**
     * Convenience: run from an ActionEvent project context (shows a
     * notification with result in a real implementation; this scaffold
     * simply executes and returns the string).
     */
    fun run(project: Project, prompt: String) {
        val cwd = project.basePath ?: return
        Thread {
            val result = execute(cwd, prompt)
            // In a real plugin you would update a tool window UI or show a notification here.
            println("[LevelCode] $result")
        }.start()
    }
}
