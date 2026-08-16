import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import LocalApp from './local/LocalApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalApp />
  </StrictMode>,
)
