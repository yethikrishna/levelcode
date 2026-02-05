import { jsonToolResult } from '@levelcode/common/util/messages'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { ProjectFileContext } from '@levelcode/common/util/file'

type ToolName = 'skill'

export const handleSkill = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  fileContext: ProjectFileContext
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, fileContext } = params
  const { name } = toolCall.input

  await previousToolCallFinished

  const skills = fileContext.skills ?? {}
  const skill = skills[name]

  if (!skill) {
    const availableSkills = Object.keys(skills)
    const suggestion =
      availableSkills.length > 0
        ? ` Available skills: ${availableSkills.join(', ')}`
        : ' No skills are currently available.'

    return {
      output: jsonToolResult({
        name,
        description: '',
        content: `Error: Skill '${name}' not found.${suggestion}`,
      }),
    }
  }

  const result: { name: string; description: string; content: string; license?: string } = {
    name: skill.name,
    description: skill.description,
    content: skill.content,
  }
  if (skill.license) {
    result.license = skill.license
  }

  return {
    output: jsonToolResult(result),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
