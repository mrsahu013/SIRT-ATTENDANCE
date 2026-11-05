// app/components/Toast.jsx
'use client';

export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      className={`fixed left-1/2 -translate-x-1/2 z-[60] max-w-md w-[92%] px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl border ${
        toast.type === 'error'
          ? 'bg-rose-950 text-rose-200 border-rose-500/50'
          : 'bg-emerald-950 text-emerald-200 border-emerald-500/50'
      }`}
    >
      {toast.message}
    </div>
  );
}