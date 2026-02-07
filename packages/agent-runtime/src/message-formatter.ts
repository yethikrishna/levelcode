import type { TeamProtocolMessage } from '@levelcode/common/types/team-protocol'

/**
 * Formats a single TeamProtocolMessage into a human-readable string
 * suitable for injection into an agent's message history.
 */
export function formatTeamMessage(message: TeamProtocolMessage): string {
  switch (message.type) {
    case 'message':
      return [
        `<teammate-message from="${message.from}" to="${message.to}" timestamp="${message.timestamp}">`,
        message.summary ? `Summary: ${message.summary}` : null,
        message.text,
        '</teammate-message>',
      ]
        .filter(Boolean)
        .join('\n')

    case 'broadcast':
      return [
        `<teammate-broadcast from="${message.from}" timestamp="${message.timestamp}">`,
        message.summary ? `Summary: ${message.summary}` : null,
        message.text,
        '</teammate-broadcast>',
      ]
        .filter(Boolean)
        .join('\n')

    case 'shutdown_request':
      return [
        `<shutdown-request requestId="${message.requestId}" from="${message.from}" timestamp="${message.timestamp}">`,
        `You have received a shutdown request from "${message.from}".`,
        message.reason ? `Reason: ${message.reason}` : null,
        `To approve, use the SendMessage tool with type "shutdown_response", request_id "${message.requestId}", and approve: true.`,
        `To reject, use the SendMessage tool with type "shutdown_response", request_id "${message.requestId}", approve: false, and provide a reason.`,
        '</shutdown-request>',
      ]
        .filter(Boolean)
        .join('\n')

    case 'shutdown_approved':
      return [
        `<shutdown-approved requestId="${message.requestId}" from="${message.from}" timestamp="${message.timestamp}">`,
        `Your shutdown request (${message.requestId}) was approved by "${message.from}". You should now gracefully terminate.`,
        '</shutdown-approved>',
      ].join('\n')

    case 'shutdown_rejected':
      return [
        `<shutdown-rejected requestId="${message.requestId}" from="${message.from}" timestamp="${message.timestamp}">`,
        `Your shutdown request (${message.requestId}) was rejected by "${message.from}".`,
        `Reason: ${message.reason}`,
        '</shutdown-rejected>',
      ].join('\n')

    case 'plan_approval_request':
      return [
        `<plan-approval-request requestId="${message.requestId}" from="${message.from}" timestamp="${message.timestamp}">`,
        `Teammate "${message.from}" is requesting approval for their plan:`,
        '',
        message.planContent,
        '',
        `To approve, use the SendMessage tool with type "plan_approval_response", request_id "${message.requestId}", recipient "${message.from}", and approve: true.`,
        `To reject, use the SendMessage tool with type "plan_approval_response", request_id "${message.requestId}", recipient "${message.from}", approve: false, and provide feedback.`,
        '</plan-approval-request>',
      ].join('\n')

    case 'plan_approval_response':
      return [
        `<plan-approval-response requestId="${message.requestId}" approved="${message.approved}" timestamp="${message.timestamp}">`,
        message.approved
          ? 'Your plan has been approved. You may proceed with implementation.'
          : `Your plan was rejected.${message.feedback ? ` Feedback: ${message.feedback}` : ''}`,
        '</plan-approval-response>',
      ].join('\n')

    case 'task_completed':
      return [
        `<task-completed from="${message.from}" taskId="${message.taskId}" timestamp="${message.timestamp}">`,
        `Teammate "${message.from}" has completed task "${message.taskSubject}" (ID: ${message.taskId}).`,
        '</task-completed>',
      ].join('\n')

    case 'idle_notification':
      return [
        `<idle-notification from="${message.from}" timestamp="${message.timestamp}">`,
        `Teammate "${message.from}" is now idle and available for new tasks.`,
        message.summary ? `Summary: ${message.summary}` : null,
        message.completedTaskId
          ? `Completed task ID: ${message.completedTaskId}`
          : null,
        '</idle-notification>',
      ]
        .filter(Boolean)
        .join('\n')

    default: {
      const _exhaustive: never = message
      return `<unknown-message>${JSON.stringify(_exhaustive)}</unknown-message>`
    }
  }
}

/**
 * Formats an array of TeamProtocolMessages into a single string block
 * wrapped in a system-level container tag, ready for injection into
 * the agent's message history.
 */
export function formatInboxMessages(
  messages: TeamProtocolMessage[],
): string | null {
  if (messages.length === 0) {
    return null
  }

  const formatted = messages.map(formatTeamMessage).join('\n\n')

  return [
    '<teammate-messages>',
    `You have ${messages.length} new message${messages.length === 1 ? '' : 's'} from your teammates:`,
    '',
    formatted,
    '',
    'Process these messages and respond appropriately. Use the SendMessage tool to reply to teammates.',
    '</teammate-messages>',
  ].join('\n')
}
