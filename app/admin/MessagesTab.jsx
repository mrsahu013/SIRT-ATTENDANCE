// app/admin/MessagesTab.jsx
'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { ref, get, update, remove } from 'firebase/database';

const TYPE_LABEL = { feedback: 'Feedback', bug: 'Problem', question: 'Question', other: 'Other' };
const TYPE_STYLE = {
  feedback: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  bug: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  question: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  other: 'bg-slate-700/40 text-slate-300 border-slate-600',
};
const STATUS_STYLE = {
  new: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  read: 'bg-slate-800 text-slate-400 border-slate-700',
  replied: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
};

const fmtTime = (ts) =>
  ts
    ? new Date(ts).toLocaleString([], {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

const inputCls =
  'bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500';

export default function MessagesTab({ showToast }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const snap = await get(ref(db, 'messages'));
      const val = snap.exists() ? snap.val() : {};
      const list = Object.entries(val)
        .map(([ticket, m]) => ({ ticket, ...m }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setMessages(list);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchLocal = (ticket, fields) =>
    setMessages((prev) => prev.map((m) => (m.ticket === ticket ? { ...m, ...fields } : m)));

  const setBusyFor = (ticket, value) => setBusy((p) => ({ ...p, [ticket]: value }));

  const markRead = async (ticket) => {
    patchLocal(ticket, { status: 'read' });
    try {
      await update(ref(db, `messages/${ticket}`), { status: 'read' });
    } catch (err) {
      console.error(err);
      patchLocal(ticket, { status: 'new' });
    }
  };

  const toggle = (m) => {
    const opening = !expanded[m.ticket];
    setExpanded((p) => ({ ...p, [m.ticket]: opening }));
    if (opening && m.status === 'new') markRead(m.ticket);
  };

  const sendReply = async (m) => {
    const text = (drafts[m.ticket] ?? m.reply ?? '').trim();
    if (!text) return;
    setBusyFor(m.ticket, true);
    try {
      const fields = { reply: text, repliedAt: Date.now(), status: 'replied' };
      await update(ref(db, `messages/${m.ticket}`), fields);
      patchLocal(m.ticket, fields);
      setDrafts((p) => {
        const n = { ...p };
        delete n[m.ticket];
        return n;
      });
      showToast(`Reply saved. ${m.name} can read it with code ${m.ticket}.`);
    } catch (err) {
      console.error(err);
      showToast('Could not save the reply: ' + err.message, 'error');
    } finally {
      setBusyFor(m.ticket, false);
    }
  };

  const deleteMessage = async (m) => {
    if (!confirm(`Delete this message from ${m.name}? This cannot be undone.`)) return;
    setBusyFor(m.ticket, true);
    try {
      await remove(ref(db, `messages/${m.ticket}`));
      setMessages((prev) => prev.filter((x) => x.ticket !== m.ticket));
      showToast('Message deleted.');
    } catch (err) {
      console.error(err);
      showToast('Could not delete: ' + err.message, 'error');
      setBusyFor(m.ticket, false);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${text}`);
    } catch {}
  };

  const newCount = useMemo(() => messages.filter((m) => m.status === 'new').length, [messages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (!q) return true;
      return (
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.message?.toLowerCase().includes(q) ||
        m.ticket?.toLowerCase().includes(q)
      );
    });
  }, [messages, search, statusFilter, typeFilter]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-200">Messages from users</h2>
          <p className="text-xs text-slate-400 mt-1">
            Showing {filtered.length} of {messages.length} &middot;{' '}
            <span className="text-emerald-400 font-semibold">{newCount} new</span>
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          type="search"
          placeholder="Search name, email, code or text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="replied">Replied</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">
          {error}
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">
          {messages.length === 0 ? 'No messages yet.' : 'No messages match your filters.'}
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((m) => {
          const isOpen = !!expanded[m.ticket];
          const draft = drafts[m.ticket] ?? m.reply ?? '';
          const isBusy = !!busy[m.ticket];
          const mailto = `mailto:${m.email}?subject=${encodeURIComponent(
            `Re: your message to Mark Student (${m.ticket})`
          )}&body=${encodeURIComponent(draft)}`;

          return (
            <article
              key={m.ticket}
              className={`border rounded-xl overflow-hidden ${
                m.status === 'new' ? 'border-emerald-500/40 bg-slate-950/70' : 'border-slate-800 bg-slate-950/40'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(m)}
                aria-expanded={isOpen}
                className="w-full text-left p-4 hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-semibold text-slate-100 text-sm">{m.name}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_STYLE[m.type] || TYPE_STYLE.other}`}>
                    {TYPE_LABEL[m.type] || 'Other'}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[m.status] || STATUS_STYLE.read}`}>
                    {m.status === 'new' ? 'New' : m.status === 'replied' ? 'Replied' : 'Read'}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">{fmtTime(m.createdAt)}</span>
                </div>
                <p className={`text-sm text-slate-400 ${isOpen ? '' : 'line-clamp-2'} break-words`}>
                  {m.message}
                </p>
              </button>

              {isOpen && (
                <div className="border-t border-slate-800 p-4 space-y-4">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Email</dt>
                      <dd className="text-slate-200 break-all">{m.email}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Code</dt>
                      <dd>
                        <button
                          type="button"
                          onClick={() => copy(m.ticket)}
                          title="Tap to copy"
                          className="font-mono text-cyan-300 hover:underline"
                        >
                          {m.ticket}
                        </button>
                      </dd>
                    </div>
                  </dl>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Full message</p>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{m.message}</p>
                  </div>

                  <div>
                    <label htmlFor={`reply-${m.ticket}`} className="text-xs font-semibold text-slate-400 block mb-1.5">
                      {m.reply ? `Your reply (sent ${fmtTime(m.repliedAt)})` : 'Your reply'}
                    </label>
                    <textarea
                      id={`reply-${m.ticket}`}
                      rows={4}
                      maxLength={2000}
                      value={draft}
                      onChange={(e) => setDrafts((p) => ({ ...p, [m.ticket]: e.target.value }))}
                      placeholder="Write a reply. The user sees it when they enter their code on the Contact page."
                      className={`${inputCls} w-full resize-y`}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => sendReply(m)}
                      disabled={isBusy || !draft.trim()}
                      className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {m.reply ? 'Update reply' : 'Save reply'}
                    </button>
                    <a
                      href={mailto}
                      className="text-center bg-slate-800 border border-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
                    >
                      Also email {draft.trim() ? 'this reply' : 'user'}
                    </a>
                    <button
                      type="button"
                      onClick={() => deleteMessage(m)}
                      disabled={isBusy}
                      className="sm:ml-auto bg-rose-500/10 text-rose-400 border border-rose-500/30 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-rose-500 hover:text-white disabled:opacity-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}