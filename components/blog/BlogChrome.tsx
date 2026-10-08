// Header and footer for the public blog pages, in the landing page's style.
// A platform admin also sees a way into the editor (adminHref).

import Link from 'next/link'
import { PenSquare } from 'lucide-react'

export function BlogHeader({ adminHref, adminLabel }: { adminHref?: string | null; adminLabel?: string }) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/autoura-logo.png" alt="Autoura" className="w-9 h-9 object-contain" />
          <span className="text-[17px] font-bold text-[#111710] tracking-[-0.3px]">Autoura</span>
          <span className="hidden sm:inline text-[17px] font-medium text-gray-400">Blog</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium text-[#555]">
          <Link href="/blog" className="hover:text-[#111710]">All posts</Link>
          <Link href="/docs" className="hidden sm:inline hover:text-[#111710]">Docs</Link>
          <Link href="/about" className="hidden sm:inline hover:text-[#111710]">About</Link>
          {adminHref && (
            <Link href={adminHref} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#3B5E2E]/30 text-[#3B5E2E] hover:bg-[#3B5E2E]/5" data-testid="blog-admin-link">
              <PenSquare className="w-4 h-4" /> {adminLabel ?? 'Manage posts'}
            </Link>
          )}
          <a href="https://calendly.com/autoura" target="_blank" rel="noopener noreferrer"
            className="hidden md:inline px-4 py-2 bg-[#3B5E2E] text-white font-semibold rounded-[9px] hover:bg-[#2F4C24]">
            Book a demo
          </a>
        </nav>
      </div>
    </header>
  )
}

export function BlogFooter() {
  return (
    <footer className="border-t border-gray-100 mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-500">
        <p>© {new Date().getFullYear()} Autoura — operations software for tour operators.</p>
        <nav className="flex flex-wrap justify-center gap-5">
          <Link href="/" className="hover:text-stone-700">Home</Link>
          <Link href="/blog" className="hover:text-stone-700">Blog</Link>
          <Link href="/docs" className="hover:text-stone-700">Docs</Link>
          <Link href="/privacy" className="hover:text-stone-700">Privacy</Link>
          <Link href="/terms" className="hover:text-stone-700">Terms</Link>
          <Link href="/contact" className="hover:text-stone-700">Contact</Link>
        </nav>
      </div>
    </footer>
  )
}

export const fmtPostDate = (iso: string | null, language: string) =>
  iso
    ? new Date(iso).toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    : ''
