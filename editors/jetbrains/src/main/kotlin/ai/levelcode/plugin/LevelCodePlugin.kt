package ai.levelcode.plugin

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.ui.Messages

/**
 * Top-level LevelCode action that launches the CLI from within the IDE.
 */
class LevelCodeAction : AnAction("Ask LevelCode"), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val prompt = Messages.showInputDialog(
            project,
            "What would you like LevelCode to do?",
            "LevelCode",
            Messages.getQuestionIcon()
        ) ?: return

        LevelCodeCliRunner.run(project, prompt)
    }
}
