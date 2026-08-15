// Tauri v2 sets __TAURI_INTERNALS__ on the window object
export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window

// Opens a URL in the OS default browser — works in both web and Tauri
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
