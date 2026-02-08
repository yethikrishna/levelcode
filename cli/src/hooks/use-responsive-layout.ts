type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface ResponsiveLayout {
  breakpoint: Breakpoint
  columns: number
  panelWidth: number
  compactMode: boolean
  showSidebar: boolean
}

export function useResponsiveLayout(): ResponsiveLayout {
  const columns = process.stdout.columns ?? 80

  let breakpoint: Breakpoint
  if (columns < 60) breakpoint = 'xs'
  else if (columns < 80) breakpoint = 'sm'
  else if (columns < 120) breakpoint = 'md'
  else if (columns < 160) breakpoint = 'lg'
  else breakpoint = 'xl'

  return {
    breakpoint,
    columns,
    panelWidth: breakpoint === 'xs' ? columns - 2 : Math.min(100, columns - 4),
    compactMode: breakpoint === 'xs' || breakpoint === 'sm',
    showSidebar: breakpoint === 'lg' || breakpoint === 'xl',
  }
}
