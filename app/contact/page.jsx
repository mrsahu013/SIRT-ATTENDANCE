// app/contact/page.jsx  (public: no login needed)
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { ref, set, get } from 'firebase/database';
import { useCRDashboard } from '@/lib/useCRDashboard';

const TYPES = [
  { id: 'feedback', label: 'Feedback', hint: 'An idea or a compliment' },
  { id: 'bug', label: 'Problem', hint: 'Something is not working' },
  { id: 'question', label: 'Question', hint: 'You need help' },
  { id: 'other', label: 'Other', hint: 'Anything else' },
];

const MAX_MESSAGE = 2000;
const LAST_SENT_KEY = 'ms_last_contact';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

const makeTicket = () => {
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  return 'MS-' + Array.from(buf, (b) => ALPHABET[b % 32]).join('');
};

const normalizeTicket = (value) => {
  const c = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length === 10) return 'MS-' + c;
  if (c.length === 12 && c.startsWith('MS')) return 'MS-' + c.slice(2);
  return '';
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

const field =
  'w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-100 placeholder:text-slate-500';

export default function ContactPage() {
  const { user } = useCRDashboard();
  const [tab, setTab] = useState('send'); // 'send' | 'reply'

  // Send form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState('feedback');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot, real users never fill it
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentTicket, setSentTicket] = useState('');
  const [copied, setCopied] = useState(false);

  // Check-reply
  const [ticketInput, setTicketInput] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [found, setFound] = useState(null);

  // Prefill email for signed-in CRs
  useEffect(() => {
    if (user?.email) setEmail((prev) => prev || user.email);
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (website) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanMessage = message.trim();

    if (!cleanName) return setError('Please enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail))
      return setError('Please enter a valid email address.');
    if (cleanMessage.length < 5) return setError('Please write a little more in your message.');

    try {
      const last = Number(localStorage.getItem(LAST_SENT_KEY)) || 0;
      if (Date.now() - last < 30000) {
        return setError('Please wait a few seconds before sending another message.');
      }
    } catch {}

    setSending(true);
    try {
      const ticket = makeTicket();
      await set(ref(db, `messages/${ticket}`), {
        name: cleanName,
        email: cleanEmail,
        type,
        message: cleanMessage,
        createdAt: Date.now(),
        status: 'new',
      });
      try {
        localStorage.setItem(LAST_SENT_KEY, String(Date.now()));
      } catch {}
      setSentTicket(ticket);
      setMessage('');
    } catch (err) {
      console.error(err);
      setError('Could not send your message. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const copyTicket = async () => {
    try {
      await navigator.clipboard.writeText(sentTicket);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const runLookup = async (code) => {
    setLookupError('');
    setFound(null);

    const ticket = normalizeTicket(code);
    if (!ticket) {
      setLookupError('That code does not look right. It starts with MS- and has 10 more characters.');
      return;
    }

    setLookupBusy(true);
    try {
      const snap = await get(ref(db, `messages/${ticket}`));
      if (!snap.exists()) {
        setLookupError('No message found for this code. Check it and try again.');
      } else {
        setFound({ ticket, ...snap.val() });
      }
    } catch (err) {
      console.error(err);
      setLookupError('Could not check right now. Please try again.');
    } finally {
      setLookupBusy(false);
    }
  };

  const lookup = (e) => {
    e.preventDefault();
    runLookup(ticketInput);
  };

  const goCheckReply = () => {
    setTicketInput(sentTicket);
    setTab('reply');
    setFound(null);
    setLookupError('');
  };

  const tabCls = (id) =>
    `flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
      tab === id ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
    }`;

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-10 font-sans">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <Link href="/" className="text-sm text-cyan-400 hover:underline">
            &larr; Back to home
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mt-3">
            Contact us
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Send feedback, report a problem or ask a question. You don&apos;t need an account.
          </p>
        </div>

        <div role="tablist" className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          <button role="tab" aria-selected={tab === 'send'} onClick={() => setTab('send')} className={tabCls('send')}>
            Send a message
          </button>
          <button role="tab" aria-selected={tab === 'reply'} onClick={() => setTab('reply')} className={tabCls('reply')}>
            Check for a reply
          </button>
        </div>

        {/* ---------- Send ---------- */}
        {tab === 'send' &&
          (sentTicket ? (
            <section className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-5 sm:p-6">
              <h2 className="text-lg font-bold text-emerald-400">Message sent</h2>
              <p className="text-sm text-slate-300 mt-1">
                Save this code. You need it to read our reply.
              </p>
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <code className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-lg font-mono font-bold tracking-wider text-cyan-300 text-center select-all">
                  {sentTicket}
                </code>
                <button
                  type="button"
                  onClick={copyTicket}
                  className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100 px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
                >
                  {copied ? 'Copied' : 'Copy code'}
                </button>
              </div>
              <div className="mt-5 flex flex-col sm:flex-row gap-3 text-sm">
                <button
                  type="button"
                  onClick={goCheckReply}
                  className="text-cyan-400 hover:underline text-left"
                >
                  Check for a reply
                </button>
                <button
                  type="button"
                  onClick={() => setSentTicket('')}
                  className="text-cyan-400 hover:underline text-left"
                >
                  Send another message
                </button>
              </div>
            </section>
          ) : (
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
              {error && (
                <p
                  role="alert"
                  className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-4 text-sm"
                >
                  {error}
                </p>
              )}

              <form onSubmit={submit} className="space-y-5">
                <fieldset>
                  <legend className="block text-xs font-semibold text-slate-400 mb-2">
                    What is this about?
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {TYPES.map((t) => (
                      <label
                        key={t.id}
                        className={`cursor-pointer rounded-xl border px-3.5 py-3 transition-colors ${
                          type === t.id
                            ? 'bg-cyan-500/10 border-cyan-500/60'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="type"
                          value={t.id}
                          checked={type === t.id}
                          onChange={() => setType(t.id)}
                          className="sr-only"
                        />
                        <span className={`block text-sm font-semibold ${type === t.id ? 'text-cyan-300' : 'text-slate-200'}`}>
                          {t.label}
                        </span>
                        <span className="block text-xs text-slate-500 mt-0.5">{t.hint}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="c-name" className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Your name
                    </label>
                    <input
                      id="c-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={100}
                      autoComplete="name"
                      required
                      className={field}
                    />
                  </div>
                  <div>
                    <label htmlFor="c-email" className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Email
                    </label>
                    <input
                      id="c-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={150}
                      autoComplete="email"
                      required
                      className={field}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="c-msg" className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Message
                  </label>
                  <textarea
                    id="c-msg"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={MAX_MESSAGE}
                    rows={6}
                    required
                    className={`${field} resize-y`}
                    placeholder="Tell us what happened or what you would like to see."
                  />
                  <p className="text-xs text-slate-500 text-right mt-1">
                    {message.length}/{MAX_MESSAGE}
                  </p>
                </div>

                {/* Honeypot */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
                  <label>
                    Website
                    <input
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3.5 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {sending ? 'Sending...' : 'Send message'}
                </button>
              </form>
            </section>
          ))}

        {/* ---------- Check reply ---------- */}
        {tab === 'reply' && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-slate-200">Your code</h2>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              You got it after sending your message. It looks like MS-K7P2X9QF4M.
            </p>

            <form onSubmit={lookup} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder="MS-XXXXXXXXXX"
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="Message code"
                className={`${field} font-mono sm:flex-1`}
              />
              <button
                type="submit"
                disabled={lookupBusy || !ticketInput.trim()}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-3 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {lookupBusy ? 'Checking...' : 'Check'}
              </button>
            </form>

            {lookupError && (
              <p role="alert" className="text-sm text-rose-400 mt-3">
                {lookupError}
              </p>
            )}

            {found && (
              <div className="mt-5 space-y-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">You wrote on {fmtTime(found.createdAt)}</p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{found.message}</p>
                </div>

                {found.reply ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-4">
                    <p className="text-xs font-bold text-emerald-400 mb-1">
                      Reply{found.repliedAt ? ` · ${fmtTime(found.repliedAt)}` : ''}
                    </p>
                    <p className="text-sm text-emerald-50 whitespace-pre-wrap break-words">{found.reply}</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-4">
                    {found.status === 'read'
                      ? 'We have read your message and will reply soon.'
                      : 'Your message has been received. No reply yet.'}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}