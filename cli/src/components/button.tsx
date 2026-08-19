import { memo, useRef, useState } from 'react'

import { makeTextUnselectable } from './clickable'
import { useTheme } from '../hooks/use-theme'

import type { ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
  onClick?: (e?: unknown) => void | Promise<unknown>
  onMouseOver?: () => void
  onMouseOut?: () => void
  style?: Record<string, unknown>
  children?: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  active?: boolean
  [key: string]: unknown
}

export const Button = memo(function Button({
  onClick,
  onMouseOver,
  onMouseOut,
  style,
  children,
  variant,
  size,
  disabled = false,
  active = false,
  ...rest
}: ButtonProps) {
  const theme = useTheme()
  const processedChildren = makeTextUnselectable(children)
  const mouseDownRef = useRef(false)
  const [hovered, setHovered] = useState(false)

  const hasVariantStyling = variant !== undefined

  const sizeStyles: Record<ButtonSize, Record<string, unknown>> = {
    sm: { paddingLeft: 1, paddingRight: 1, paddingTop: 0, paddingBottom: 0 },
    md: { paddingLeft: 2, paddingRight: 2, paddingTop: 0, paddingBottom: 0 },
    lg: { paddingLeft: 3, paddingRight: 3, paddingTop: 1, paddingBottom: 1 },
  }

  const getVariantStyles = (): Record<string, unknown> => {
    if (!hasVariantStyling) return {}
    if (disabled) {
      return {
        fg: theme.foregroundSubtle ?? theme.muted,
        backgroundColor: 'transparent',
      }
    }

    const isHovered = hovered || active

    switch (variant) {
      case 'primary':
        return {
          fg: '#ffffff',
          backgroundColor: theme.primary,
        }
      case 'secondary':
        return {
          fg: isHovered ? theme.foreground : theme.foregroundMuted ?? theme.muted,
          backgroundColor: isHovered ? theme.surfaceHover : theme.surface,
        }
      case 'danger':
        return {
          fg: isHovered ? '#ffffff' : theme.error,
          backgroundColor: isHovered ? theme.error : 'transparent',
        }
      case 'success':
        return {
          fg: isHovered ? '#ffffff' : theme.success,
          backgroundColor: isHovered ? theme.success : 'transparent',
        }
      case 'ghost':
      default:
        return {
          fg: isHovered ? theme.foreground : theme.foregroundMuted ?? theme.muted,
          backgroundColor: isHovered ? theme.surfaceHover : 'transparent',
        }
    }
  }

  const handleMouseDown = () => {
    if (disabled) return
    mouseDownRef.current = true
  }

  const handleMouseUp = (e?: unknown) => {
    if (disabled) return
    if (mouseDownRef.current && onClick) {
      onClick(e)
    }
    mouseDownRef.current = false
  }

  const handleMouseOut = () => {
    mouseDownRef.current = false
    setHovered(false)
    onMouseOut?.()
  }

  const handleMouseOver = () => {
    if (!disabled) {
      setHovered(true)
    }
    onMouseOver?.()
  }

  const baseStyle: Record<string, unknown> = hasVariantStyling
    ? {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        ...(size ? sizeStyles[size] : {}),
        ...getVariantStyles(),
      }
    : {}

  return (
    <box
      {...rest}
      style={{
        ...baseStyle,
        ...style,
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      {processedChildren}
    </box>
  )
})
