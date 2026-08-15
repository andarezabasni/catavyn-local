import { Link } from 'react-router'
import {
  FileText, CheckSquare, FolderOpen, Users, Lock, Download,
  Moon, Bell, ArrowRight, Check, PenLine, Layers, CalendarCheck,
  Monitor, ChevronDown,
} from 'lucide-react'
import appLogo from '../assets/logo.png'

const GITHUB_REPO = 'https://github.com/andarezabasni/catavyn'
const WINDOWS_DOWNLOAD = 'https://github.com/andarezabasni/catavyn/releases'

const FEATURES = [
  {
    icon: FileText,
    color: '#C4A84D',
    title: 'Notes & sub-notes',
    text: 'A calm, rich-text editor with headings, lists and checklists. Nest sub-notes to keep big topics tidy.',
  },
  {
    icon: CheckSquare,
    color: '#6B8B6A',
    title: 'Daily tasks',
    text: 'Plan your day with a built-in task panel — due times, priorities, and a mini calendar at a glance.',
  },
  {
    icon: FolderOpen,
    color: '#C4844D',
    title: 'Categories & tags',
    text: 'Organize the way you think. Color-coded categories and tags make everything findable in seconds.',
  },
  {
    icon: Users,
    color: '#5B8B5A',
    title: 'Collaboration',
    text: 'Share a note with a friend or teammate. Edits sync in real time, with a full activity trail.',
  },
  {
    icon: Lock,
    color: '#8B8B6A',
    title: 'Private notes',
    text: 'Lock sensitive notes behind a PIN. Your data is protected by row-level security on every request.',
  },
  {
    icon: Download,
    color: '#C4A84D',
    title: 'No lock-in',
    text: 'Export any note to Markdown or PDF anytime. Import your existing .md files in one click.',
  },
  {
    icon: Bell,
    color: '#C4844D',
    title: 'Task reminders',
    text: 'Turn on browser notifications and Catavyn nudges you the moment a task is due.',
  },
  {
    icon: Moon,
    color: '#6B8B6A',
    title: 'Warm dark mode',
    text: 'A cozy, paper-like theme by day and a warm, easy-on-the-eyes dark theme by night.',
  },
]

const STEPS = [
  {
    icon: PenLine,
    title: 'Capture',
    text: 'Hit “New note” and just write. Autosave has your back — nothing is ever lost.',
  },
  {
    icon: Layers,
    title: 'Organize',
    text: 'Drop notes into categories, add colorful tags, and pin what matters most.',
  },
  {
    icon: CalendarCheck,
    title: 'Plan your day',
    text: 'Add tasks with due times, check the mini calendar, and get reminded right on time.',
  },
]

// Web-optimized JPEG variants (~100 KB each vs ~1.3 MB source PNGs)
const SCREENSHOTS = [
  { src: '/screenshot/2.jpg', alt: 'Catavyn home workspace with categories, reminders and pinned notes' },
  { src: '/screenshot/4.jpg', alt: 'Catavyn warm dark mode' },
  { src: '/screenshot/5.jpg', alt: 'Catavyn notes page with search and category filters' },
  { src: '/screenshot/3.jpg', alt: 'Catavyn PIN-locked private notes' },
]

const PROMISES = [
  'Free forever — no premium wall',
  'No ads, no tracking',
  'Export your data anytime',
  'Open source on GitHub',
]

const FAQS = [
  {
    q: 'Is Catavyn really free?',
    a: 'Yes — completely. There is no premium tier, no feature wall, and no ads. Catavyn is an open-source project; you can even read the code on GitHub.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. Catavyn runs in any modern browser. If you prefer a native app, there is also a free desktop version for Windows you can download from GitHub.',
  },
  {
    q: 'Is my data private?',
    a: 'Your notes are stored in your own account and protected with row-level security — no one else can read them. You can additionally lock individual notes with a PIN.',
  },
  {
    q: 'Can I take my notes elsewhere?',
    a: 'Anytime. Every note can be exported to Markdown or PDF, and you can import existing Markdown files too. Your notes are never held hostage.',
  },
  {
    q: 'Can I work together with someone?',
    a: 'Yes — invite a collaborator to any note by email. You control whether they can edit or just view, and changes sync in real time.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-page text-text-primary overflow-x-hidden">
      {/* Nav */}
      <header className="max-w-5xl mx-auto flex items-center justify-between px-4 sm:px-5 py-4 sm:py-5">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <img src={appLogo} alt="" className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0" />
          <span className="font-display text-lg sm:text-xl font-bold tracking-wide">CATAVYN</span>
        </div>
        <nav className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Link
            to="/login"
            className="rounded-lg px-2.5 sm:px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-accent-gold px-3 sm:px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative">
        {/* Soft decorative glows */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-24 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-accent-gold/15 blur-3xl" />
          <div className="absolute top-1/2 -left-28 w-64 h-64 sm:w-80 sm:h-80 rounded-full bg-accent-green/15 blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-5 pt-10 sm:pt-16 pb-12 sm:pb-16 text-center">
          <p className="inline-block rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-medium text-text-secondary mb-5 sm:mb-6">
            ✨ Free · Open source · Web &amp; Windows
          </p>
          <h1 className="font-display text-[2.1rem] leading-[1.15] sm:text-5xl md:text-6xl sm:leading-tight font-bold max-w-3xl mx-auto">
            Your notes,{' '}
            <span className="italic text-accent-gold">beautifully</span>{' '}
            organized.
          </h1>
          <p className="text-text-secondary text-[15px] sm:text-lg max-w-xl mx-auto mt-4 sm:mt-5 leading-relaxed">
            Catavyn is a lightweight notes &amp; daily task app with a warm, paper-like feel.
            No clutter, no lock-in, no price tag — just a calm place to think and plan.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-7 sm:mt-8 px-2 sm:px-0">
            <Link
              to="/register"
              className="flex items-center justify-center gap-2 rounded-xl bg-accent-gold px-6 py-3 text-sm sm:text-base font-semibold text-white hover:opacity-90 transition-opacity shadow-sm"
            >
              Start writing — it&rsquo;s free
              <ArrowRight size={16} />
            </Link>
            <a
              href={WINDOWS_DOWNLOAD}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-bg-card px-6 py-3 text-sm sm:text-base font-semibold text-text-primary hover:border-accent-gold/60 transition-colors"
            >
              <Monitor size={16} />
              Download for Windows
            </a>
          </div>
          <p className="text-text-muted text-xs mt-3">No credit card. No trial. Just sign up and write.</p>

          {/* Hero screenshot */}
          <div className="mt-10 sm:mt-14 rounded-xl sm:rounded-2xl border border-border bg-bg-card shadow-xl overflow-hidden">
            <img
              src="/screenshot/1.jpg"
              alt="Catavyn dashboard — notes, categories, reminders and pinned notes in one calm workspace"
              className="w-full h-auto block"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-5 py-12 sm:py-16">
        <p className="text-accent-gold text-xs font-semibold uppercase tracking-widest text-center mb-2">How it works</p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-center">
          Three steps to a clearer head.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mt-8 sm:mt-10">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="relative rounded-2xl border border-border bg-bg-card p-5 sm:p-6 text-center">
              <span className="absolute top-4 right-4 font-display text-3xl font-bold text-border select-none" aria-hidden="true">
                {i + 1}
              </span>
              <div className="w-11 h-11 rounded-xl bg-accent-gold/15 flex items-center justify-center mx-auto mb-3.5">
                <Icon size={20} className="text-accent-gold" />
              </div>
              <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
              <p className="text-text-secondary text-xs leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-5 py-12 sm:py-16">
        <p className="text-accent-gold text-xs font-semibold uppercase tracking-widest text-center mb-2">Features</p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-center">
          Everything you need. Nothing you don&rsquo;t.
        </h2>
        <p className="text-text-secondary text-center mt-3 max-w-lg mx-auto text-sm sm:text-base">
          Catavyn isn&rsquo;t trying to be everything. It does notes, tasks and organization — done well.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 mt-8 sm:mt-10">
          {FEATURES.map(({ icon: Icon, color, title, text }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-bg-card p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                style={{ backgroundColor: `${color}26` }}
              >
                <Icon size={18} style={{ color }} />
              </div>
              <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
              <p className="text-text-secondary text-xs leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Screenshot gallery — swipeable on mobile */}
      <section className="py-12 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-5">
          <p className="text-accent-gold text-xs font-semibold uppercase tracking-widest text-center mb-2">Screenshots</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-center">
            See it in action.
          </h2>
          <p className="text-text-muted text-xs text-center mt-2 sm:hidden">Swipe to browse →</p>
        </div>
        <div className="mt-7 sm:mt-10 flex gap-4 overflow-x-auto snap-x snap-mandatory px-4 sm:px-[max(1.25rem,calc((100vw-64rem)/2))] pb-4 [-webkit-overflow-scrolling:touch]">
          {SCREENSHOTS.map(shot => (
            <img
              key={shot.src}
              src={shot.src}
              alt={shot.alt}
              loading="lazy"
              className="snap-center shrink-0 w-[86%] sm:w-135 rounded-xl border border-border shadow-md bg-bg-card"
            />
          ))}
        </div>
      </section>

      {/* Promises */}
      <section className="max-w-5xl mx-auto px-4 sm:px-5 py-12 sm:py-16">
        <div className="rounded-2xl bg-bg-task-panel text-white px-5 sm:px-10 py-9 sm:py-12">
          <div className="flex flex-col md:flex-row md:items-center gap-7 sm:gap-8">
            <div className="flex-1">
              <h2 className="font-display text-2xl sm:text-3xl font-bold">
                Your notes belong to you.
              </h2>
              <p className="text-white/70 text-sm mt-3 leading-relaxed max-w-md">
                Most note apps hold your data hostage behind subscriptions and proprietary formats.
                Catavyn is free, open source, and exports clean Markdown — so you can leave anytime.
                We think that&rsquo;s exactly why you&rsquo;ll stay.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {PROMISES.map(p => (
                <li key={p} className="flex items-center gap-2.5 text-sm text-white/90">
                  <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-4 sm:px-5 py-12 sm:py-16">
        <p className="text-accent-gold text-xs font-semibold uppercase tracking-widest text-center mb-2">FAQ</p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-7 sm:mb-9">
          Questions, answered.
        </h2>
        <div className="flex flex-col gap-3">
          {FAQS.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-xl border border-border bg-bg-card px-4 sm:px-5 py-3.5 open:pb-4"
            >
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown size={16} className="text-text-muted shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="text-text-secondary text-sm leading-relaxed mt-2.5">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative max-w-5xl mx-auto px-4 sm:px-5 py-14 sm:py-20 text-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 sm:w-96 sm:h-96 rounded-full bg-accent-gold/10 blur-3xl" />
        </div>
        <div className="relative">
          <h2 className="font-display text-2xl sm:text-4xl font-bold">
            Ready for a calmer way to take notes?
          </h2>
          <p className="text-text-secondary mt-3">Set up takes less than a minute.</p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-7 px-2 sm:px-0">
            <Link
              to="/register"
              className="flex items-center justify-center gap-2 rounded-xl bg-accent-gold px-6 py-3 text-sm sm:text-base font-semibold text-white hover:opacity-90 transition-opacity shadow-sm"
            >
              Create your free account
              <ArrowRight size={16} />
            </Link>
            <a
              href={WINDOWS_DOWNLOAD}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-bg-card px-6 py-3 text-sm sm:text-base font-semibold text-text-primary hover:border-accent-gold/60 transition-colors"
            >
              <Monitor size={16} />
              Get the Windows app
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-7 sm:py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="flex items-center gap-2">
              <img src={appLogo} alt="" className="w-6 h-6 object-contain" />
              <span className="font-display text-sm font-bold tracking-wide">CATAVYN</span>
            </div>
            <span className="text-text-muted text-xs sm:ml-2">Notes &amp; daily tasks, done calmly.</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <Link to="/login" className="hover:text-text-primary transition-colors">Sign in</Link>
            <Link to="/register" className="hover:text-text-primary transition-colors">Register</Link>
            <a href={WINDOWS_DOWNLOAD} target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">
              Windows app
            </a>
            <a href={GITHUB_REPO} target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
