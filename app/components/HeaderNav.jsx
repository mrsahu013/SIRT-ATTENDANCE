// app/components/HeaderNav.jsx
'use client';
import Link from 'next/link';

const LINKS = [
  { href: '/', label: '✓ Mark Attendance' },
  { href: '/students', label: '📚 Students' },
  { href: '/progress', label: '📊 Progress & Records' },
  { href: '/profile', label: '👤 Profile' },
];

export default function HeaderNav({ active }) {
  return (
    <nav className="max-w-4xl mx-auto flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-4">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            active === link.href
              ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}