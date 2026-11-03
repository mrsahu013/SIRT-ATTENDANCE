// app/progress/page.jsx
'use client';
import { useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { ref, remove } from 'firebase/database';
import { normalizeRoll, formatDate, getLocalDate, shiftDate } from '@/lib/dateUtils';
import { RETENTION_DAYS, MIN_ATTENDANCE_PERCENT, MAX_SEMESTER } from '@/lib/config';
import { useCRDashboard, useToast, authLoadingScreen } from '@/lib/useCRDashboard';
import HeaderNav from '../components/HeaderNav';
import Toast from '../components/Toast';

const semesterOptions = Array.from({ length: MAX_SEMESTER }, (_, i) => i + 1);

export default function ProgressPage() {
  const {
    user,
    loadingAuth,
    crData,
    students,
    historyTree,
    setHistoryTree,
    semester,
    selectSemester,
    showAnnouncement,
    announcement,
    dismissAnnouncement,
  } = useCRDashboard();
  const { toast, showToast } = useToast();

  const todayStr = getLocalDate();
  const oldestStr = shiftDate(todayStr, -(RETENTION_DAYS - 1));

  const history = useMemo(() => historyTree[semester] || {}, [historyTree, semester]);

  // Semester-wise overall progress
  const semesterProgress = useMemo(() => {
    const rows = [];
    for (let s = 1; s <= MAX_SEMESTER; s++) {
      const semHist = historyTree[s] || {};
      const recordCount = Object.keys(semHist).length;
      if (recordCount === 0) continue;

      let present = 0;
      let total = 0;
      Object.values(semHist).forEach((rec) => {
        (rec.present || []).forEach(() => present++);
        total += (rec.present || []).length + (rec.absent || []).length;
      });
      rows.push({
        sem: s,
        records: recordCount,
        present,
        total,
        pct: total > 0 ? Math.round((present / total) * 100) : null,
      });
    }
    return rows;
  }, [historyTree]);

  // Per-student % for the selected semester
  const stats = useMemo(() => {
    const m = {};
    const bump = (roll, isPresent) => {
      const k = normalizeRoll(roll);
      if (!m[k]) m[k] = { present: 0, total: 0 };
      m[k].total += 1;
      if (isPresent) m[k].present += 1;
    };
    Object.values(history).forEach((rec) => {
      (rec.present || []).forEach((p) => bump(p.roll, true));
      (rec.absent || []).forEach((a) => bump(a.roll, false));
    });
    return m;
  }, [history]);

  const studentRows = useMemo(
    () =>
      Object.entries(students)
        .sort(
          (a, b) =>
            a[1].rollNumber.localeCompare(b[1].rollNumber, undefined, { numeric: true })
        )
        .map(([id, s]) => {
          const st = stats[normalizeRoll(s.rollNumber)];
          return {
            id,
            name: s.name,
            roll: s.rollNumber,
            pct: st && st.total > 0 ? Math.round((st.present / st.total) * 100) : null,
            present: st?.present || 0,
            total: st?.total || 0,
          };
        }),
    [students, stats]
  );

  const historyList = useMemo(
    () =>
      Object.entries(history)
        .map(([dateKey, rec]) => ({ dateKey, rec }))
        .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1)),
    [history]
  );

  const handleDeleteRecord = async (dateKey) => {
    if (!confirm(`Delete the saved attendance of Semester ${semester} for ${formatDate(dateKey)}?`)) return;
    try {
      await remove(ref(db, `attendance/${user.uid}/sem${semester}/${dateKey}`));
      setHistoryTree((prev) => {
        const sem = { ...(prev[semester] || {}) };
        delete sem[dateKey];
        return { ...prev, [semester]: sem };
      });
      showToast('Record deleted.');
    } catch (error) {
      console.error(error);
      showToast('Could not delete record.', 'error');
    }
  };

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

      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            Progress & Records
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Semester-wise attendance overview. Records are kept for {RETENTION_DAYS} days (6 months) per semester.
          </p>
        </div>
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
      </div>

      <HeaderNav active="/progress" />

      {/* Semester-wise progress table */}
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-1">📊 Semester-wise Progress</h2>
        <p className="text-xs text-slate-500 mb-4">
          Overall attendance percentage per semester.
        </p>
        {semesterProgress.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            No attendance records yet. Save your first record from the Mark Attendance page.
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-xs">
                  <th className="p-3">Semester</th>
                  <th className="p-3">Saved Records</th>
                  <th className="p-3">Present / Total</th>
                  <th className="p-3">Attendance %</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {semesterProgress.map((row) => (
                  <tr key={row.sem} className={`hover:bg-slate-950/40 transition-colors ${row.sem === semester ? 'bg-cyan-500/5 border-l-4 border-cyan-500' : ''}`}>
                    <td className="p-3 font-semibold text-cyan-400">Semester {row.sem}</td>
                    <td className="p-3 text-slate-300">{row.records}</td>
                    <td className="p-3 text-slate-300">{row.present} / {row.total}</td>
                    <td className="p-3 text-xs">
                      {row.pct === null ? (
                        <span className="text-slate-600">No records yet</span>
                      ) : (
                        <span className={`font-semibold ${row.pct < MIN_ATTENDANCE_PERCENT ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {row.pct}%
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {row.sem === semester ? (
                        <span className="text-xs text-cyan-400 font-semibold">Selected</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectSemester(row.sem)}
                          className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-lg text-xs font-medium hover:bg-cyan-500 hover:text-slate-950 transition-all cursor-pointer">
                          Open
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-student % for the selected semester */}
      {studentRows.length > 0 && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-1">👤 Student Attendance — Semester {semester}</h2>
          <p className="text-xs text-slate-500 mb-3">
            Below {MIN_ATTENDANCE_PERCENT}% is flagged in red.
          </p>
          <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-xs sticky top-0">
                  <th className="p-3">Roll Number</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {studentRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-950/40 transition-colors">
                    <td className="p-3 font-semibold text-cyan-400">{row.roll}</td>
                    <td className="p-3 text-slate-300">{row.name}</td>
                    <td className="p-3 text-xs">
                      {row.pct === null ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <span className={`font-semibold ${row.pct < MIN_ATTENDANCE_PERCENT ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {row.pct}% <span className="text-slate-500 font-normal">({row.present}/{row.total})</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Saved records */}
      {historyList.length > 0 && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-1">🗓 Semester {semester} Records</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {historyList.map(({ dateKey, rec }) => {
              const p = (rec.present || []).length;
              const a = (rec.absent || []).length;
              return (
                <div
                  key={dateKey}
                  className="flex items-center justify-between gap-2 border border-slate-800 bg-slate-950/50 rounded-xl px-3 py-2 text-sm">
                  <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-semibold text-slate-200">{formatDate(dateKey)}</span>
                    <span className="text-emerald-400 text-xs">Present: {p}</span>
                    <span className="text-rose-400 text-xs">Absent: {a}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteRecord(dateKey)}
                    className="text-xs text-rose-400 hover:text-white hover:bg-rose-500 border border-rose-500/30 px-2 py-1 rounded-lg transition-all">
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}