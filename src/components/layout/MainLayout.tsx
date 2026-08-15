import type { ReactNode } from 'react'
import Sidebar from './Sidebar'

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-page">
      <Sidebar />
      {/* Offset content so it doesn't sit behind the sidebar */}
      <main className="md:ml-20 pb-20 md:pb-0 min-h-screen">
        {children}
      </main>
    </div>
  )
}
