// app/components/AppShell.jsx
// One layout for every CR page:
//   laptop (lg+): fixed left sidebar + content
//   phone:        sticky top bar + bottom tab bar
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { MAX_SEMESTER } from '@/lib/config';
import { useCRDashboard } from '@/lib/useCRDashboard';
import Toast from './Toast';

const semesterOptions = Array.from({ length: MAX_SEMESTER }, (_, i) => i + 1);

const ICONS = {
  check: 'M20 6 9 17l-5-5',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  chart: 'M3 3v18h18 M7 14l4-4 4 4 5-6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
};

export function Icon({ name, className = 'w-5 h-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const NAV = [
  { href: '/', label: 'Attendance', icon: 'check' },
  { href: '/students', label: 'Students', icon: 'users' },
  { href: '/progress', label: 'Progress', icon: 'chart' },
  { href: '/profile', label: 'Profile', icon: 'user' },
];

export default function AppShell({ title, subtitle, toast, showSemester = false, children }) {
  const pathname = usePathname();
  const {
    user,
    crData,
    semester,
    selectSemester,
    showAnnouncement,
    announcement,
    dismissAnnouncement,
  } = useCRDashboard();

  const adminEmail = process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL;
  const isAdmin =
    !!adminEmail && !!user?.email && user.email.toLowerCase() === adminEmail.toLowerCase();

  const logout = () => signOut(auth); // provider redirects to /login

  return (
    <>
      <Toast toast={toast} />

      <div className="flex-1 lg:flex">
        {/* ---------- Sidebar (laptop) ---------- */}
        <aside className="hidden lg:flex lg:w-64 xl:w-72 shrink-0 flex-col sticky top-0 h-dvh border-r border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-8">
            <p className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              Mark Student
            </p>
            <p className="text-xs text-slate-500 mt-0.5">CR Portal</p>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                >
                  <Icon name={l.icon} />
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3">
            {crData && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-sm font-semibold text-slate-100 truncate">{crData.crName}</p>
                <p className="text-xs text-slate-400 truncate">
                  {crData.branch} &middot; Sec {crData.section}
                </p>
                {crData.userId && (
                  <p className="text-xs font-mono text-cyan-400 mt-1">ID {crData.userId}</p>
                )}
              </div>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500 hover:text-slate-950 transition-colors"
              >
                <Icon name="shield" />
                Admin panel
              </Link>
            )}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-rose-400 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500 hover:text-white transition-colors"
            >
              <Icon name="logout" />
              Log out
            </button>
          </div>
        </aside>

        {/* ---------- Content ---------- */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header
            style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
            className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 pb-3 sm:px-6 lg:px-8"
          >
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-slate-100 truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-xs sm:text-sm text-slate-400 truncate">{subtitle}</p>
                )}
              </div>

              {showSemester && (
                <label
                  className="flex items-center gap-2 shrink-0 bg-slate-900 border border-cyan-500/40 rounded-xl pl-3 pr-1.5 py-1"
                  title="Your default semester is set in Profile"
                >
                  <span className="text-xs font-semibold text-cyan-400 hidden sm:inline">
                    Semester
                  </span>
                  <select
                    value={semester}
                    onChange={(e) => selectSemester(Number(e.target.value))}
                    aria-label="Semester"
                    className="bg-slate-900 text-cyan-300 text-sm font-semibold py-1.5 focus:outline-none cursor-pointer"
                  >
                    {semesterOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                        {crData?.semester === n ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </header>

          <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-8 pb-28 lg:pb-8 space-y-5">
            {showAnnouncement && (
              <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-400 mb-1">Announcement</p>
                  <p className="text-sm text-amber-100 whitespace-pre-wrap break-words">
                    {announcement.message}
                  </p>
                </div>
                <button
                  onClick={dismissAnnouncement}
                  className="shrink-0 w-9 h-9 -mr-1 -mt-1 rounded-lg text-amber-300 hover:text-white hover:bg-amber-500/20"
                  aria-label="Dismiss announcement"
                >
                  ✕
                </button>
              </div>
            )}

            {children}
          </main>
        </div>
      </div>

      {/* ---------- Bottom tab bar (phone / tablet) ---------- */}
      <nav
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-slate-800 bg-slate-900/95 backdrop-blur"
        aria-label="Main"
      >
        {NAV.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                active ? 'text-cyan-400' : 'text-slate-500 active:text-slate-300'
              }`}
            >
              <span
                className={`px-4 py-1 rounded-full transition-colors ${
                  active ? 'bg-cyan-500/15' : ''
                }`}
              >
                <Icon name={l.icon} />
              </span>
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}