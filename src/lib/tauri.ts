import { isTauri as coreIsTauri } from '@tauri-apps/api/core'

// Detect whether we're running inside the Tauri desktop WebView. Prefer the
// official helper (Tauri v2 sets `window.isTauri`), with fallbacks to the
// injected internals for robustness across dev/release timing.
export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    if (coreIsTauri()) return true
  } catch {
    /* fall through to marker checks */
  }
  return (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    (window as unknown as { isTauri?: boolean }).isTauri === true
  )
}

// Opens a URL in the OS default browser — works in both web and Tauri
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
