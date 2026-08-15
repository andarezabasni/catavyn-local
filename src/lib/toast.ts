type ToastType = 'error' | 'success'
type ToastFn = (message: string, type: ToastType) => void

let _show: ToastFn | null = null

export const toast = {
  _register: (fn: ToastFn) => { _show = fn },
  _unregister: () => { _show = null },
  error: (message: string) => _show?.(message, 'error'),
  success: (message: string) => _show?.(message, 'success'),
}
