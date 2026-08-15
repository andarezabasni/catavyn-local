import { X, Heart, Mail, ExternalLink } from 'lucide-react'
import { openExternal } from '../../lib/tauri'

interface SupportModalProps {
  onClose: () => void
}

export default function SupportModal({ onClose }: SupportModalProps) {
  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-text-primary/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Support Catavyn"
        onKeyDown={handleKey}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-bg-card rounded-2xl border border-border shadow-xl w-full max-w-sm pointer-events-auto animate-fade-up">

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Heart size={15} className="text-red-400 fill-red-400" />
              <h2 className="text-text-primary font-semibold text-sm">Support Catavyn</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-page transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            <p className="text-text-secondary text-xs leading-relaxed">
              Catavyn is free and open source. If it helps your daily workflow,
              consider buying me a coffee — it keeps the project alive! ☕
            </p>

            {/* Donation buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openExternal('https://saweria.co/andreza09')}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-bg-page px-3 py-3.5 text-center hover:border-accent-gold/50 hover:bg-accent-gold/5 transition-colors group"
              >
                <span className="text-xl">🇮🇩</span>
                <span className="text-text-primary font-semibold text-xs">Saweria</span>
                <span className="text-text-muted text-[10px]">QRIS / Transfer</span>
                <ExternalLink size={10} className="text-text-muted group-hover:text-accent-gold transition-colors" />
              </button>

              <button
                type="button"
                onClick={() => openExternal('https://paypal.me/andreza110')}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-bg-page px-3 py-3.5 text-center hover:border-[#0070BA]/40 hover:bg-[#0070BA]/5 transition-colors group"
              >
                <span className="text-xl">🌐</span>
                <span className="text-text-primary font-semibold text-xs">PayPal</span>
                <span className="text-text-muted text-[10px]">@andreza110</span>
                <ExternalLink size={10} className="text-text-muted group-hover:text-[#0070BA] transition-colors" />
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Contact */}
            <div className="flex items-center gap-2">
              <Mail size={12} className="text-text-muted shrink-0" />
              <button
                type="button"
                onClick={() => openExternal('mailto:andarezabasni28@gmail.com')}
                className="text-text-muted text-xs hover:text-accent-gold transition-colors truncate"
              >
                andarezabasni28@gmail.com
              </button>
            </div>

            {/* Footer note */}
            <p className="text-text-muted text-[10px] text-center">
              Made with ❤️ by Andrezabasni · Open source on GitHub
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
