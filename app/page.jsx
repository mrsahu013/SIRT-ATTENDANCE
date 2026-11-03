'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import Link from 'next/link';
import html2canvas from 'html2canvas';
import { getLocalDate, shiftDate, normalizeRoll, formatDate, formatDateForFile } from '@/lib/dateUtils';
import { RETENTION_DAYS, MAX_SEMESTER } from '@/lib/config';
import { useCRDashboard, useToast, authLoadingScreen } from '@/lib/useCRDashboard';
import HeaderNav from './components/HeaderNav';
import Toast from './components/Toast';
import { db } from "../lib/firebase";

// Build the { studentId: true/false } map for a date from a saved record.
const buildAttendanceFor = (studentsObj, record) => {
  const result = {};
  const absentRolls = new Set(
    (record?.absent || []).map((a) => normalizeRoll(a.roll))
  );
  Object.entries(studentsObj || {}).forEach(([id, s]) => {
    result[id] = !absentRolls.has(normalizeRoll(s.rollNumber));
  });
  return result;
};

const byRoll = (a, b) =>
  a[1].rollNumber.localeCompare(b[1].rollNumber, undefined, { numeric: true });

const semesterOptions = Array.from({ length: MAX_SEMESTER }, (_, i) => i + 1);

export default function Home() {
  const {
    user,
    loadingAuth,
    crData,
    students,
    historyTree,
    setHistoryTree,
    showAnnouncement,
    announcement,
    dismissAnnouncement,
    semester,
    selectSemester,
  } = useCRDashboard();
  const { toast, showToast } = useToast();

  const todayStr = getLocalDate();
  const oldestStr = shiftDate(todayStr, -(RETENTION_DAYS - 1));
  const MASTER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL;

  // Attendance marking state (page-local)
  const [attendance, setAttendance] = useState({});
  const [markedDate, setMarkedDate] = useState(todayStr);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const exportFullRef = useRef(null);

  const history = useMemo(() => historyTree[semester] || {}, [historyTree, semester]);
  const submittedAttendance = history[markedDate] || null;
  const isEditingExisting = !!submittedAttendance;

  // Rebuild the checklist whenever roster / semester / date / history changes
  useEffect(() => {
    if (loadingAuth) return;
    const rec = (historyTree[semester] || {})[markedDate] || null;
    setAttendance(buildAttendanceFor(students, rec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAuth, students, semester, markedDate, historyTree]);

  // ---------- Attendance ----------
  const handleAttendanceChange = (id) => {
    setAttendance((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allStudentsMarked =
    Object.keys(students).length > 0 &&
    Object.keys(students).every((id) => !!attendance[id]);

  const handleToggleAllAttendance = () => {
    const targetState = !allStudentsMarked;
    const updatedAtt = {};
    Object.keys(students).forEach((id) => {
      updatedAtt[id] = targetState;
    });
    setAttendance(updatedAtt);
  };

  const handleDateChange = (dateStr) => {
    if (!dateStr || dateStr > todayStr || dateStr < oldestStr) return;
    setMarkedDate(dateStr);
    setStudentSearch('');
  };

  const submitAttendance = async () => {
    if (!user) return;
    if (Object.keys(students).length === 0) return;

    const existing = history[markedDate];
    if (
      existing &&
      !confirm(`Attendance for Semester ${semester}, ${formatDate(markedDate)} is already saved. Overwrite it?`)
    ) {
      return;
    }

    const presentList = [];
    const absentList = [];
    Object.entries(students)
      .sort(byRoll)
      .forEach(([id, s]) => {
        const item = { roll: s.rollNumber, name: s.name };
        if (attendance[id]) presentList.push(item);
        else absentList.push(item);
      });

    const attendanceRecord = {
      date: markedDate,
      semester: semester,
      timestamp: Date.now(),
      present: presentList,
      absent: absentList,
    };

    setSavingAttendance(true);
    try {
        await set(
        ref(db, `attendance/${user.uid}/sem${semester}/${markedDate}`),
        attendanceRecord
      );
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
      const canvas = await html2canvas(exportFullRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
      });
      const image = canvas.toDataURL('image/jpeg', 1.0);
      const link = document.createElement('a');
      link.href = image;
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

  // ---------- Derived ----------
  const sortedStudentsList = useMemo(
    () => Object.entries(students).sort(byRoll),
    [students]
  );

  const filteredMarkerList = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return sortedStudentsList;
    return sortedStudentsList.filter(
      ([, s]) =>
        s.name.toLowerCase().includes(q) || s.rollNumber.toLowerCase().includes(q)
    );
  }, [sortedStudentsList, studentSearch]);

  const presentCount = Object.keys(students).filter((id) => attendance[id]).length;
  const totalCount = Object.keys(students).length;

  // ---------- Render ----------
  if (loadingAuth) return authLoadingScreen;
  if (!user) return null; // redirecting to /login

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <Toast toast={toast} />

      {/* Admin announcement */}
      {showAnnouncement && (
        <div className="max-w-4xl mx-auto bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">📢 Announcement</p>
            <p className="text-sm text-amber-100 whitespace-pre-wrap">{announcement.message}</p>
          </div>
          <button onClick={dismissAnnouncement} className="text-amber-300 hover:text-white text-sm px-2" aria-label="Dismiss announcement">✕</button>
        </div>
      )}

      {/* Top bar */}
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            CR Portal Dashboard
          </h1>
          {crData && (
            <p className="text-slate-400 text-sm mt-1">
              <span className="text-slate-200 font-medium">{crData.crName}</span>{crData.userId && <> <span className="font-mono text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full">ID: {crData.userId}</span></>} (Roll: {crData.crRollNumber}) | {crData.collegeName} | {crData.branch} Sec {crData.section} | TG: {crData.tgName}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Semester selector + date */}
          <div className="flex items-center gap-2 bg-slate-950 border border-cyan-500/40 rounded-xl px-3 py-2" title="Your default semester is set in Profile">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Semester</span>
            <select
              value={semester}
              onChange={(e) => selectSemester(Number(e.target.value))}
              className="bg-slate-950 text-cyan-300 text-sm font-semibold focus:outline-none cursor-pointer">
              {semesterOptions.map((n) => (
                <option key={n} value={n}>Semester {n}</option>
              ))}
            </select>
            {crData?.semester === semester && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                Default
              </span>
            )}
          </div>
          {user?.email && MASTER_ADMIN_EMAIL && user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() && (
            <button
              onClick={() => (window.location.href = '/admin')}
              className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-cyan-500 hover:text-slate-950 transition-all">
              Admin Panel
            </button>
          )}
          <button
            onClick={() => signOut(auth).then(() => window.location.reload())}
            className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-rose-500 hover:text-white transition-all">
            Logout
          </button>
        </div>
      </div>

      <HeaderNav active="/" />

      {/* Empty roster CTA */}
      {sortedStudentsList.length === 0 ? (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-200 mb-2">No students in your list yet</h2>
          <p className="text-sm text-slate-400 mb-6">
            Add your students once — they're shared across Semester 1 to 8. Then come back here to mark attendance.
          </p>
          <Link
            href="/students"
            className="inline-block bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20">
            📚 Go to Students →
          </Link>
        </div>
      ) : (
        <>
          {/* Mark Attendance — the core of the home page */}
          <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-200">✓ Mark Attendance — Semester {semester}</h2>
                <button
                  type="button"
                  onClick={handleToggleAllAttendance}
                  className={`text-xs px-3.5 py-1.5 rounded-lg font-bold border transition-all shadow-md ${
                    allStudentsMarked
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500 hover:text-white shadow-rose-950/20'
                      : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-white shadow-emerald-950/20'
                  }`}>
                  {allStudentsMarked ? '✕ Unmark All' : '✓ Mark All'}
                </button>
                <span className="text-xs text-slate-400 font-mono">
                  ({presentCount}/{totalCount} Present)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-cyan-400 font-mono">{formatDate(markedDate)}</span>
                <input
                  type="date"
                  value={markedDate}
                  min={oldestStr}
                  max={todayStr}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm focus:outline-none focus:border-cyan-500 text-slate-200"
                />
              </div>
            </div>

            {isEditingExisting && (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
                ✏️ Attendance for Semester {semester}, {formatDate(markedDate)} is already saved. Saving again will overwrite it.
              </p>
            )}

            <input
              type="text"
              placeholder="🔍 Search student by name or roll..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 mb-3"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto mb-4 border border-slate-800/80 p-4 rounded-xl bg-slate-950/50">
              {filteredMarkerList.length === 0 && (
                <p className="text-xs text-slate-500 col-span-full text-center py-2">No students match your search.</p>
              )}
              {filteredMarkerList.map(([id, s]) => (
                <label
                  key={id}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                    attendance[id]
                      ? 'bg-slate-900/90 border-cyan-500/40 hover:border-cyan-500'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 opacity-60'
                  }`}>
                  <span className={`text-sm font-medium ${attendance[id] ? 'text-slate-100 font-semibold' : 'text-slate-400 line-through'}`}>
                    {s.rollNumber} - {s.name}
                  </span>
                  <input
                    type="checkbox"
                    checked={attendance[id] ?? true}
                    onChange={() => handleAttendanceChange(id)}
                    className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
                  />
                </label>
              ))}
            </div>

            <button
              onClick={submitAttendance}
              disabled={savingAttendance}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3.5 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-cyan-900/20">
              {savingAttendance ? 'Saving...' : isEditingExisting ? '💾 Update Attendance' : '💾 Save Attendance'}
            </button>
          </div>

          {/* Saved result for the selected date + export/share */}
          {submittedAttendance && (
            <div className="max-w-4xl mx-auto bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-xl p-6 mb-6">
              <div className="text-center mb-5">
                <h3 className="text-lg font-bold text-cyan-400 mb-1">
                  ✅ Attendance Recorded — Semester {submittedAttendance.semester || semester}
                </h3>
                <p className="text-xs text-slate-400">
                  {formatDate(submittedAttendance.date)} • Kept for {RETENTION_DAYS} days (6 months).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-emerald-400">{(submittedAttendance.present || []).length}</p>
                  <p className="text-xs text-emerald-300 font-semibold">Present</p>
                </div>
                <div className="bg-rose-500/15 border border-rose-500/40 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-rose-400">{(submittedAttendance.absent || []).length}</p>
                  <p className="text-xs text-rose-300 font-semibold">Absent</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="border border-emerald-500/40 rounded-xl overflow-hidden">
                  <div className="bg-emerald-600 text-white text-sm font-bold px-4 py-2">
                    Present ({(submittedAttendance.present || []).length})
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-emerald-900/40">
                    {(submittedAttendance.present || []).length === 0 ? (
                      <p className="p-3 text-xs text-slate-400">No present students</p>
                    ) : (
                      submittedAttendance.present.map((p, idx) => (
                        <div key={idx} className="px-4 py-2 text-sm bg-emerald-500/20 text-emerald-100">
                          <span className="font-mono font-semibold">{p.roll}</span> - {p.name}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-rose-500/40 rounded-xl overflow-hidden">
                  <div className="bg-rose-600 text-white text-sm font-bold px-4 py-2">
                    Absent ({(submittedAttendance.absent || []).length})
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-rose-900/40">
                    {(submittedAttendance.absent || []).length === 0 ? (
                      <p className="p-3 text-xs text-slate-400">No absent students 🎉</p>
                    ) : (
                      submittedAttendance.absent.map((a, idx) => (
                        <div key={idx} className="px-4 py-2 text-sm bg-rose-500/20 text-rose-100">
                          <span className="font-mono font-semibold">{a.roll}</span> - {a.name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <button onClick={downloadFullJPG} className="bg-purple-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/20">
                  🖼️ Download Present + Absent (JPG)
                </button>
                <button onClick={copyWhatsAppText} className="bg-slate-800 border border-slate-700 text-slate-100 px-6 py-3 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-all">
                  📋 Copy Text
                </button>
                <button onClick={shareOnWhatsApp} className="bg-emerald-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20">
                  💬 Share on WhatsApp
                </button>
              </div>
            </div>
          )}

          {/* Hidden template for JPG export */}
          <div style={{ position: 'absolute', left: '-9999px' }}>
            <div ref={exportFullRef} style={{ width: '700px', padding: '30px', background: '#ffffff', color: '#000000', fontFamily: 'Arial, sans-serif' }}>
              <h2 style={{ textAlign: 'center', color: '#1e3a8a', margin: '0 0 10px 0' }}>{crData?.collegeName}</h2>
              <p style={{ textAlign: 'center', fontSize: '14px', color: '#4b5563', margin: '0 0 20px 0' }}>
                Branch: {crData?.branch} | Sec: {crData?.section} | Semester: {submittedAttendance?.semester || semester} | TG: {crData?.tgName}
              </p>
              <hr style={{ border: '1px solid #e5e7eb', marginBottom: '20px' }} />
              <h3 style={{ margin: '0 0 10px 0' }}>Attendance Report - {formatDate(submittedAttendance?.date)}</h3>
              <p style={{ margin: '4px 0' }}><strong>CR Name:</strong> {crData?.crName} ({crData?.crRollNumber})</p>
              <p style={{ margin: '4px 0 16px 0' }}>
                <strong>Present:</strong> <span style={{ color: '#15803d', fontWeight: 'bold' }}>{(submittedAttendance?.present || []).length}</span>
                {'  |  '}
                <strong>Absent:</strong> <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>{(submittedAttendance?.absent || []).length}</span>
                {'  |  '}
                <strong>Total:</strong> {(submittedAttendance?.present || []).length + (submittedAttendance?.absent || []).length}
              </p>

              <div style={{ background: '#dcfce7', border: '2px solid #16a34a', borderRadius: '8px', padding: '15px', marginBottom: '16px' }}>
                <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#166534', fontSize: '16px' }}>
                  Present Students ({(submittedAttendance?.present || []).length})
                </p>
                {(submittedAttendance?.present || []).length === 0 ? (
                  <p style={{ margin: 0, fontSize: '14px', color: '#166534' }}>None</p>
                ) : (
                  submittedAttendance.present.map((p, idx) => (
                    <div key={idx} style={{ fontSize: '14px', color: '#14532d', padding: '4px 0', borderBottom: '1px solid #bbf7d0' }}>
                      {idx + 1}. {p.roll} - {p.name}
                    </div>
                  ))
                )}
              </div>

              <div style={{ background: '#fee2e2', border: '2px solid #dc2626', borderRadius: '8px', padding: '15px' }}>
                <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#991b1b', fontSize: '16px' }}>
                  Absent Students ({(submittedAttendance?.absent || []).length})
                </p>
                {(submittedAttendance?.absent || []).length === 0 ? (
                  <p style={{ margin: 0, fontSize: '14px', color: '#991b1b' }}>None</p>
                ) : (
                  submittedAttendance.absent.map((a, idx) => (
                    <div key={idx} style={{ fontSize: '14px', color: '#7f1d1d', padding: '4px 0', borderBottom: '1px solid #fecaca' }}>
                      {idx + 1}. {a.roll} - {a.name}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}