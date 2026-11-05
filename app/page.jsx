// app/page.jsx  (Mark Attendance)
'use client';
import { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, memo } from 'react';
import { db } from '@/lib/firebase';
import { ref, set } from 'firebase/database';
import Link from 'next/link';
import { getLocalDate, shiftDate, normalizeRoll, formatDate, formatDateForFile } from '@/lib/dateUtils';
import { RETENTION_DAYS } from '@/lib/config';
import { byRoll } from '@/lib/sort';
import { useCRDashboard, useToast, authLoadingScreen } from '@/lib/useCRDashboard';
import AppShell from './components/AppShell';

const buildAttendanceFor = (studentsObj, record) => {
  const result = {};
  const absentRolls = new Set((record?.absent || []).map((a) => normalizeRoll(a.roll)));
  Object.entries(studentsObj || {}).forEach(([id, s]) => {
    result[id] = !absentRolls.has(normalizeRoll(s.rollNumber));
  });
  return result;
};

const StudentRow = memo(function StudentRow({ id, s, checked, onToggle }) {
  return (
    <label
      className={`flex items-center gap-3 min-h-14 px-3.5 py-2.5 rounded-xl cursor-pointer border transition-colors select-none ${
        checked
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-rose-500/10 border-rose-500/30'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(id)}
        className="w-6 h-6 accent-emerald-500 shrink-0 cursor-pointer"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-100 truncate">{s.name}</span>
        <span className="block text-xs font-mono text-slate-400">{s.rollNumber}</span>
      </span>
      <span className={`text-xs font-bold ${checked ? 'text-emerald-400' : 'text-rose-400'}`}>
        {checked ? 'Present' : 'Absent'}
      </span>
    </label>
  );
});

function NameList({ title, list, tone }) {
  const t =
    tone === 'green'
      ? { box: 'border-emerald-500/40', head: 'bg-emerald-600', row: 'bg-emerald-500/15 text-emerald-100', divide: 'divide-emerald-900/40' }
      : { box: 'border-rose-500/40', head: 'bg-rose-600', row: 'bg-rose-500/15 text-rose-100', divide: 'divide-rose-900/40' };
  return (
    <div className={`border ${t.box} rounded-xl overflow-hidden`}>
      <div className={`${t.head} text-white text-sm font-bold px-4 py-2`}>
        {title} ({list.length})
      </div>
      <div className={`lg:max-h-64 lg:overflow-y-auto divide-y ${t.divide}`}>
        {list.length === 0 ? (
          <p className="p-3 text-xs text-slate-400">
            {tone === 'green' ? 'No present students' : 'No absent students 🎉'}
          </p>
        ) : (
          list.map((p, idx) => (
            <div key={idx} className={`px-4 py-2 text-sm ${t.row}`}>
              <span className="font-mono font-semibold">{p.roll}</span> – {p.name}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loadingAuth, crData, students, historyTree, setHistoryTree, semester } =
    useCRDashboard();
  const { toast, showToast } = useToast();

  const todayStr = getLocalDate();
  const oldestStr = shiftDate(todayStr, -(RETENTION_DAYS - 1));

  const [attendance, setAttendance] = useState({});
  const [markedDate, setMarkedDate] = useState(todayStr);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const deferredSearch = useDeferredValue(studentSearch);
  const exportFullRef = useRef(null);

  const history = useMemo(() => historyTree[semester] || {}, [historyTree, semester]);
  const submittedAttendance = history[markedDate] || null;
  const isEditingExisting = !!submittedAttendance;

  useEffect(() => {
    if (loadingAuth) return;
    const rec = (historyTree[semester] || {})[markedDate] || null;
    setAttendance(buildAttendanceFor(students, rec));
  }, [loadingAuth, students, semester, markedDate, historyTree]);

  const handleAttendanceChange = useCallback(
    (id) => setAttendance((prev) => ({ ...prev, [id]: !prev[id] })),
    []
  );

  const sortedStudentsList = useMemo(() => Object.entries(students).sort(byRoll), [students]);

  const filteredMarkerList = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return sortedStudentsList;
    return sortedStudentsList.filter(
      ([, s]) => s.name.toLowerCase().includes(q) || s.rollNumber.toLowerCase().includes(q)
    );
  }, [sortedStudentsList, deferredSearch]);

  const totalCount = sortedStudentsList.length;
  const presentCount = sortedStudentsList.filter(([id]) => attendance[id]).length;
  const allStudentsMarked = totalCount > 0 && presentCount === totalCount;

  const handleToggleAllAttendance = () => {
    const target = !allStudentsMarked;
    const next = {};
    sortedStudentsList.forEach(([id]) => (next[id] = target));
    setAttendance(next);
  };

  const handleDateChange = (dateStr) => {
    if (!dateStr || dateStr > todayStr || dateStr < oldestStr) return;
    setMarkedDate(dateStr);
    setStudentSearch('');
  };

  const submitAttendance = async () => {
    if (!user || totalCount === 0) return;

    if (
      history[markedDate] &&
      !confirm(`Attendance for Semester ${semester}, ${formatDate(markedDate)} is already saved. Overwrite it?`)
    ) {
      return;
    }

    const presentList = [];
    const absentList = [];
    sortedStudentsList.forEach(([id, s]) => {
      const item = { roll: s.rollNumber, name: s.name };
      if (attendance[id]) presentList.push(item);
      else absentList.push(item);
    });

    const attendanceRecord = {
      date: markedDate,
      semester,
      timestamp: Date.now(),
      present: presentList,
      absent: absentList,
    };

    setSavingAttendance(true);
    try {
      await set(ref(db, `attendance/${user.uid}/sem${semester}/${markedDate}`), attendanceRecord);
      setHistoryTree((prev) => ({
        ...prev,
        [semester]: { ...(prev[semester] || {}), [markedDate]: attendanceRecord },
      }));
      showToast(
        `Saved Sem ${semester}, ${formatDate(markedDate)}: ${presentList.length} present, ${absentList.length} absent.`
      );
    } catch (error) {
      console.error(error);
      showToast('Could not save attendance. Check your connection and try again.', 'error');
    } finally {
      setSavingAttendance(false);
    }
  };

  // ---------- Export / share ----------
  const downloadFullJPG = async () => {
    if (!exportFullRef.current || !submittedAttendance) return;
    try {
      const html2canvas = (await import('html2canvas')).default; // loaded only when needed
      const canvas = await html2canvas(exportFullRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/jpeg', 1.0);
      const crRoll = crData?.crRollNumber || 'CR';
      link.download = `Attendance_Sem${submittedAttendance.semester || semester}_${crRoll}_${formatDateForFile(submittedAttendance.date)}.jpg`;
      link.click();
    } catch (error) {
      console.error(error);
      showToast('Could not create the image.', 'error');
    }
  };

  const buildWhatsAppText = () => {
    if (!submittedAttendance) return '';
    const present = submittedAttendance.present || [];
    const absent = submittedAttendance.absent || [];
    const total = present.length + absent.length;
    const last3 = (list) => list.map((p) => String(p.roll).slice(-3)).join(', ');
    const sem = submittedAttendance.semester || semester;

    return (
      `📋 *ATTENDANCE REPORT* 📋\n` +
      `🏫 *College:* ${crData?.collegeName}\n` +
      `📚 *Class:* ${crData?.branch} - Sec ${crData?.section} (Semester ${sem})\n` +
      `📅 *Date:* ${formatDate(submittedAttendance.date)}\n` +
      `👨‍🏫 *TG:* ${crData?.tgName}\n\n` +
      `✅ Present: ${present.length} / ${total}\n` +
      `❌ Absent: ${absent.length} / ${total}\n\n` +
      `*Absent Roll Nos*\n${absent.length ? last3(absent) : 'None 🎉'}\n\n` +
      `*Present Roll Nos*\n${present.length ? last3(present) : 'None'}`
    );
  };

  const copyWhatsAppText = async () => {
    const text = buildWhatsAppText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Attendance text copied for WhatsApp!');
    } catch {
      showToast('Could not copy. Please allow clipboard access.', 'error');
    }
  };

  const shareOnWhatsApp = () => {
    const text = buildWhatsAppText();
    if (!text) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  if (loadingAuth) return authLoadingScreen;
  if (!user) return null;

  const presentSaved = submittedAttendance?.present || [];
  const absentSaved = submittedAttendance?.absent || [];

  return (
    <AppShell
      title="Mark attendance"
      subtitle={crData ? `${crData.branch} · Sec ${crData.section} · ${crData.collegeName}` : ''}
      toast={toast}
      showSemester
    >
      {totalCount === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-200 mb-2">No students yet</h2>
          <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
            Add your students once. The same list is used for Semester 1 to 8.
          </p>
          <Link
            href="/students"
            className="inline-block bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Add students
          </Link>
        </div>
      ) : (
        <>
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-slate-200">
                  Semester {semester}
                </h2>
                <p className="text-xs text-slate-400">{formatDate(markedDate)}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={markedDate}
                  min={oldestStr}
                  max={todayStr}
                  onChange={(e) => handleDateChange(e.target.value)}
                  aria-label="Attendance date"
                  className="flex-1 sm:flex-none bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={handleToggleAllAttendance}
                  className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    allStudentsMarked
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500 hover:text-white'
                      : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                  }`}
                >
                  {allStudentsMarked ? 'Mark all absent' : 'Mark all present'}
                </button>
              </div>
            </div>

            {isEditingExisting && (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
                Already saved for this date. Saving again will overwrite it.
              </p>
            )}

            <input
              type="search"
              placeholder="Search by name or roll number"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 mb-3"
            />

            {/* On phones the page scrolls; on laptops the list scrolls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:max-h-[30rem] lg:overflow-y-auto lg:pr-1">
              {filteredMarkerList.length === 0 && (
                <p className="text-sm text-slate-500 col-span-full text-center py-6">
                  No student matches “{studentSearch}”.
                </p>
              )}
              {filteredMarkerList.map(([id, s]) => (
                <StudentRow
                  key={id}
                  id={id}
                  s={s}
                  checked={attendance[id] ?? true}
                  onToggle={handleAttendanceChange}
                />
              ))}
            </div>

            {/* Sticky save bar: stays above the bottom tabs on phones */}
            <div
              style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))' }}
              className="sticky lg:!bottom-4 z-20 mt-4 flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/95 backdrop-blur p-3 shadow-xl"
            >
              <p className="text-sm leading-tight pl-1">
                <span className="text-lg font-extrabold text-emerald-400">{presentCount}</span>
                <span className="text-slate-400"> / {totalCount} present</span>
              </p>
              <button
                onClick={submitAttendance}
                disabled={savingAttendance}
                className="ml-auto bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-5 sm:px-8 py-3 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingAttendance ? 'Saving...' : isEditingExisting ? 'Update attendance' : 'Save attendance'}
              </button>
            </div>
          </section>

          {/* Saved result + export/share */}
          {submittedAttendance && (
            <section className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 sm:p-6">
              <div className="mb-4">
                <h3 className="text-base sm:text-lg font-bold text-cyan-400">
                  Saved for Semester {submittedAttendance.semester || semester}
                </h3>
                <p className="text-xs text-slate-400">
                  {formatDate(submittedAttendance.date)} &middot; kept for {RETENTION_DAYS} days
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-emerald-400">{presentSaved.length}</p>
                  <p className="text-xs text-emerald-300 font-semibold">Present</p>
                </div>
                <div className="bg-rose-500/15 border border-rose-500/40 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-rose-400">{absentSaved.length}</p>
                  <p className="text-xs text-rose-300 font-semibold">Absent</p>
                </div>
              </div>

              {/* Share first: it's what phone users want most */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5">
                <button
                  onClick={shareOnWhatsApp}
                  className="bg-emerald-600 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-colors"
                >
                  Share on WhatsApp
                </button>
                <button
                  onClick={copyWhatsAppText}
                  className="bg-slate-800 border border-slate-700 text-slate-100 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
                >
                  Copy text
                </button>
                <button
                  onClick={downloadFullJPG}
                  className="bg-purple-600 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-purple-500 transition-colors"
                >
                  Download JPG
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NameList title="Present" list={presentSaved} tone="green" />
                <NameList title="Absent" list={absentSaved} tone="red" />
              </div>
            </section>
          )}

          {/* Hidden template for JPG export (only rendered when a record exists) */}
          {submittedAttendance && (
            <div style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
              <div
                ref={exportFullRef}
                style={{ width: '700px', padding: '30px', background: '#ffffff', color: '#000000', fontFamily: 'Arial, sans-serif' }}
              >
                <h2 style={{ textAlign: 'center', color: '#1e3a8a', margin: '0 0 10px 0' }}>{crData?.collegeName}</h2>
                <p style={{ textAlign: 'center', fontSize: '14px', color: '#4b5563', margin: '0 0 20px 0' }}>
                  Branch: {crData?.branch} | Sec: {crData?.section} | Semester: {submittedAttendance.semester || semester} | TG: {crData?.tgName}
                </p>
                <hr style={{ border: '1px solid #e5e7eb', marginBottom: '20px' }} />
                <h3 style={{ margin: '0 0 10px 0' }}>Attendance Report - {formatDate(submittedAttendance.date)}</h3>
                <p style={{ margin: '4px 0' }}><strong>CR Name:</strong> {crData?.crName} ({crData?.crRollNumber})</p>
                <p style={{ margin: '4px 0 16px 0' }}>
                  <strong>Present:</strong> <span style={{ color: '#15803d', fontWeight: 'bold' }}>{presentSaved.length}</span>
                  {'  |  '}
                  <strong>Absent:</strong> <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>{absentSaved.length}</span>
                  {'  |  '}
                  <strong>Total:</strong> {presentSaved.length + absentSaved.length}
                </p>

                <div style={{ background: '#dcfce7', border: '2px solid #16a34a', borderRadius: '8px', padding: '15px', marginBottom: '16px' }}>
                  <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#166534', fontSize: '16px' }}>
                    Present Students ({presentSaved.length})
                  </p>
                  {presentSaved.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '14px', color: '#166534' }}>None</p>
                  ) : (
                    presentSaved.map((p, idx) => (
                      <div key={idx} style={{ fontSize: '14px', color: '#14532d', padding: '4px 0', borderBottom: '1px solid #bbf7d0' }}>
                        {idx + 1}. {p.roll} - {p.name}
                      </div>
                    ))
                  )}
                </div>

                <div style={{ background: '#fee2e2', border: '2px solid #dc2626', borderRadius: '8px', padding: '15px' }}>
                  <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#991b1b', fontSize: '16px' }}>
                    Absent Students ({absentSaved.length})
                  </p>
                  {absentSaved.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '14px', color: '#991b1b' }}>None</p>
                  ) : (
                    absentSaved.map((a, idx) => (
                      <div key={idx} style={{ fontSize: '14px', color: '#7f1d1d', padding: '4px 0', borderBottom: '1px solid #fecaca' }}>
                        {idx + 1}. {a.roll} - {a.name}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}