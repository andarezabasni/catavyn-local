import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'
import LocalApp from './local/LocalApp.tsx'
import { isTauri } from './lib/tauri'

// In the Tauri desktop build, Catavyn Local runs fully offline against SQLite.
// On the web, the original Supabase-backed app is still served unchanged so the
// existing project remains recoverable during the migration.
const Root = isTauri() ? LocalApp : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
