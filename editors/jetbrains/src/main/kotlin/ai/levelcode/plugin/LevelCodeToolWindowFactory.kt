package ai.levelcode.plugin

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBPanel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.content.ContentFactory
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.*

/**
 * Factory for the LevelCode tool window. Provides a simple panel that
 * lets users type a prompt and invoke the LevelCode CLI.
 */
class LevelCodeToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = LevelCodePanel(project)
        val content = ContentFactory.getInstance()
            .createContent(panel, "LevelCode", false)
        toolWindow.contentManager.addContent(content)
    }
}

class LevelCodePanel(private val project: Project) : JBPanel<JBPanel<*>>(BorderLayout(8, 8)) {
    private val outputArea = JTextArea().apply {
        isEditable = false
        lineWrap = true
        wrapStyleWord = true
    }
    private val promptField = JTextField().apply {
        toolTipText = "Ask LevelCode to do something..."
    }
    private val runButton = JButton("Run").apply {
        addActionListener { executePrompt() }
    }

    init {
        border = BorderFactory.createEmptyBorder(8, 8, 8, 8)
        preferredSize = Dimension(480, 600)

        val inputPanel = JPanel(BorderLayout(4, 4)).apply {
            add(promptField, BorderLayout.CENTER)
            add(runButton, BorderLayout.EAST)
        }

        add(inputPanel, BorderLayout.NORTH)
        add(JBScrollPane(outputArea), BorderLayout.CENTER)

        promptField.addActionListener { executePrompt() }
    }

    private fun executePrompt() {
        val prompt = promptField.text?.trim() ?: return
        if (prompt.isEmpty()) return
        promptField.text = ""
        outputArea.append("> $prompt\n\n")

        object : SwingWorker<String, Unit>() {
            override fun doInBackground(): String {
                return LevelCodeCliRunner.execute(project.basePath ?: ".", prompt)
            }
            override fun done() {
                runCatching { outputArea.append(get() + "\n\n") }
                    .onFailure { outputArea.append("Error: ${it.message}\n\n") }
            }
        }.execute()
    }
}
