import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  variant: ToastVariant
  title: string
  message?: string
  duration: number
  actionLabel?: string
  onAction?: () => void
  createdAt: number
}

interface ToastState {
  toasts: ToastItem[]
}

interface ToastActions {
  addToast: (toast: Omit<ToastItem, 'id' | 'createdAt'> & { id?: string }) => string
  removeToast: (id: string) => void
  clearAll: () => void
}

type ToastStore = ToastState & ToastActions

const initialState: ToastState = {
  toasts: [],
}

export const useToastStore = create<ToastStore>()(
  immer((set) => ({
    ...initialState,

    addToast: (toast) => {
      const id = toast.id ?? crypto.randomUUID()
      set((state) => {
        state.toasts.unshift({
          ...toast,
          id,
          createdAt: Date.now(),
        })
      })
      return id
    },

    removeToast: (id) =>
      set((state) => {
        state.toasts = state.toasts.filter((t) => t.id !== id)
      }),

    clearAll: () => set(() => ({ toasts: [] })),
  })),
)

let toastIdCounter = 0
export function toast(options: Omit<ToastItem, 'id' | 'createdAt' | 'duration'> & { duration?: number }) {
  return useToastStore.getState().addToast({
    duration: 4000,
    ...options,
  })
}

toast.success = (title: string, message?: string) =>
  toast({ variant: 'success', title, message })

toast.error = (title: string, message?: string) =>
  toast({ variant: 'error', title, message })

toast.warning = (title: string, message?: string) =>
  toast({ variant: 'warning', title, message })

toast.info = (title: string, message?: string) =>
  toast({ variant: 'info', title, message })
