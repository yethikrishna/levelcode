export type IdleNotification = {
  type: 'idle_notification'
  from: string
  timestamp: string
  summary?: string
  completedTaskId?: string
}

export type TaskCompletedMessage = {
  type: 'task_completed'
  from: string
  taskId: string
  taskSubject: string
  timestamp: string
}

export type ShutdownRequest = {
  type: 'shutdown_request'
  requestId: string
  from: string
  reason?: string
  timestamp: string
}

export type ShutdownApproved = {
  type: 'shutdown_approved'
  requestId: string
  from: string
  timestamp: string
}

export type ShutdownRejected = {
  type: 'shutdown_rejected'
  requestId: string
  from: string
  reason: string
  timestamp: string
}

export type PlanApprovalRequest = {
  type: 'plan_approval_request'
  requestId: string
  from: string
  planContent: string
  timestamp: string
}

export type PlanApprovalResponse = {
  type: 'plan_approval_response'
  requestId: string
  approved: boolean
  feedback?: string
  timestamp: string
}

export type TeamMessage = {
  type: 'message'
  from: string
  to: string
  text: string
  summary?: string
  timestamp: string
}

export type BroadcastMessage = {
  type: 'broadcast'
  from: string
  text: string
  summary?: string
  timestamp: string
}

export type TeamProtocolMessage =
  | IdleNotification
  | TaskCompletedMessage
  | ShutdownRequest
  | ShutdownApproved
  | ShutdownRejected
  | PlanApprovalRequest
  | PlanApprovalResponse
  | TeamMessage
  | BroadcastMessage
