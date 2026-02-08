import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { Button } from '../button'

export interface BreadcrumbStep {
  key: string
  label: string
}

interface BreadcrumbNavProps {
  steps: BreadcrumbStep[]
  currentStep: string
  onStepClick?: (key: string) => void
}

export const BreadcrumbNav = memo(function BreadcrumbNav({
  steps,
  currentStep,
  onStepClick,
}: BreadcrumbNavProps) {
  const theme = useTheme()

  const currentIndex = steps.findIndex((s) => s.key === currentStep)

  return (
    <box style={{ flexDirection: 'row', gap: 0 }}>
      {steps.map((step, idx) => {
        const isCompleted = idx < currentIndex
        const isCurrent = step.key === currentStep
        const isFuture = idx > currentIndex
        const isLast = idx === steps.length - 1

        const stepColor = isCompleted
          ? theme.success
          : isCurrent
            ? theme.primary
            : theme.muted

        const stepAttr = isCompleted
          ? undefined
          : isCurrent
            ? TextAttributes.BOLD
            : TextAttributes.DIM

        const prefix = isCompleted ? '\u2713 ' : ''
        const clickable = isCompleted && onStepClick

        return (
          <box key={step.key} style={{ flexDirection: 'row' }}>
            {clickable ? (
              <Button
                onClick={() => onStepClick(step.key)}
                style={{ flexDirection: 'row' }}
              >
                <text
                  style={{
                    fg: stepColor,
                    attributes: stepAttr,
                  }}
                >
                  {prefix}{step.label}
                </text>
              </Button>
            ) : (
              <text
                style={{
                  fg: stepColor,
                  attributes: stepAttr,
                }}
              >
                {prefix}{step.label}
              </text>
            )}
            {!isLast && (
              <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                {' \u25B8 '}
              </text>
            )}
          </box>
        )
      })}
    </box>
  )
})
