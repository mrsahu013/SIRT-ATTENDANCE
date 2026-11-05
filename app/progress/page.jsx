// app/progress/page.jsx
"use client";
import { useMemo } from "react";
import { db } from "@/lib/firebase";
import { ref, remove } from "firebase/database";
import { normalizeRoll, formatDate } from "@/lib/dateUtils";
import {
  RETENTION_DAYS,
  MIN_ATTENDANCE_PERCENT,
  MAX_SEMESTER,
} from "@/lib/config";
import { byRoll } from "@/lib/sort";
import {
  useCRDashboard,
  useToast,
  authLoadingScreen,
} from "@/lib/useCRDashboard";
import AppShell from "../components/AppShell";

function Bar({ pct }) {
  return (
    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
      <div
        className={`h-full rounded-full ${pct < MIN_ATTENDANCE_PERCENT ? "bg-rose-500" : "bg-emerald-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const pctColor = (pct) =>
  pct < MIN_ATTENDANCE_PERCENT ? "text-rose-400" : "text-emerald-400";

export default function ProgressPage() {
  const {
    user,
    loadingAuth,
    students,
    historyTree,
    setHistoryTree,
    semester,
    selectSemester,
  } = useCRDashboard();
  const { toast, showToast } = useToast();

  const history = useMemo(
    () => historyTree[semester] || {},
    [historyTree, semester],
  );

  const semesterProgress = useMemo(() => {
    const rows = [];
    for (let s = 1; s <= MAX_SEMESTER; s++) {
      const semHist = historyTree[s] || {};
      const records = Object.keys(semHist).length;
      if (records === 0) continue;

      let present = 0;
      let total = 0;
      Object.values(semHist).forEach((rec) => {
        const p = (rec.present || []).length;
        present += p;
        total += p + (rec.absent || []).length;
      });
      rows.push({
        sem: s,
        records,
        present,
        total,
        pct: total > 0 ? Math.round((present / total) * 100) : null,
      });
    }
    return rows;
  }, [historyTree]);

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
        .sort(byRoll)
        .map(([id, s]) => {
          const st = stats[normalizeRoll(s.rollNumber)];
          return {
            id,
            name: s.name,
            roll: s.rollNumber,
            pct:
              st && st.total > 0
                ? Math.round((st.present / st.total) * 100)
                : null,
            present: st?.present || 0,
            total: st?.total || 0,
          };
        }),
    [students, stats],
  );

  const historyList = useMemo(
    () =>
      Object.entries(history)
        .map(([dateKey, rec]) => ({ dateKey, rec }))
        .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1)),
    [history],
  );

  const handleDeleteRecord = async (dateKey) => {
    if (
      !confirm(
        `Delete the saved attendance of Semester ${semester} for ${formatDate(dateKey)}?`,
      )
    )
      return;
    try {
      await remove(ref(db, `attendance/${user.uid}/sem${semester}/${dateKey}`));
      setHistoryTree((prev) => {
        const sem = { ...(prev[semester] || {}) };
        delete sem[dateKey];
        return { ...prev, [semester]: sem };
      });
      showToast("Record deleted.");
    } catch (error) {
      console.error(error);
      showToast("Could not delete record.", "error");
    }
  };

  if (loadingAuth) return authLoadingScreen;
  if (!user) return null;

  return (
    <AppShell
      title="Progress & records"
      subtitle={`Kept for ${RETENTION_DAYS} days per semester`}
      toast={toast}
      showSemester
    >
      {/* Semester overview */}
      <section>
        <h2 className="text-base sm:text-lg font-semibold text-slate-200 mb-3">
          By semester
        </h2>
        {semesterProgress.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-sm text-slate-400">
            No attendance saved yet. Mark and save attendance to see progress
            here.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {semesterProgress.map((row) => {
              const selected = row.sem === semester;
              return (
                <button
                  key={row.sem}
                  type="button"
                  onClick={() => selectSemester(row.sem)}
                  aria-pressed={selected}
                  className={`text-left rounded-2xl border p-4 transition-colors ${
                    selected
                      ? "bg-cyan-500/10 border-cyan-500/60"
                      : "bg-slate-900 border-slate-800 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="font-semibold text-slate-100">
                      Semester {row.sem}
                    </span>
                    {row.pct === null ? (
                      <span className="text-slate-500 text-sm">—</span>
                    ) : (
                      <span
                        className={`text-2xl font-extrabold ${pctColor(row.pct)}`}
                      >
                        {row.pct}%
                      </span>
                    )}
                  </div>
                  {row.pct !== null && <Bar pct={row.pct} />}
                  <p className="text-xs text-slate-400 mt-2">
                    {row.records} record{row.records === 1 ? "" : "s"} &middot;{" "}
                    {row.present}/{row.total} present
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Per-student */}
      {studentRows.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-slate-200">
            Students in Semester {semester}
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Below {MIN_ATTENDANCE_PERCENT}% shows in red.
          </p>
          <ul className="divide-y divide-slate-800/70 lg:max-h-[28rem] lg:overflow-y-auto">
            {studentRows.map((row) => (
              <li key={row.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">
                      {row.name}
                    </p>
                    <p className="text-xs font-mono text-slate-400">
                      {row.roll}
                    </p>
                  </div>
                  {row.pct === null ? (
                    <span className="text-slate-600 text-sm">—</span>
                  ) : (
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${pctColor(row.pct)}`}>
                        {row.pct}%
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.present}/{row.total}
                      </p>
                    </div>
                  )}
                </div>
                {row.pct !== null && (
                  <div className="mt-2">
                    <Bar pct={row.pct} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Saved records */}
      {historyList.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-slate-200 mb-3">
            Saved records, Semester {semester}
          </h2>
          <ul className="space-y-2 lg:max-h-80 lg:overflow-y-auto">
            {historyList.map(({ dateKey, rec }) => (
              <li
                key={dateKey}
                className="flex items-center justify-between gap-3 border border-slate-800 bg-slate-950/50 rounded-xl px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">
                    {formatDate(dateKey)}
                  </p>
                  <p className="text-xs">
                    <span className="text-emerald-400">
                      {(rec.present || []).length} present
                    </span>
                    <span className="text-slate-600"> &middot; </span>
                    <span className="text-rose-400">
                      {(rec.absent || []).length} absent
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteRecord(dateKey)}
                  className="shrink-0 text-xs font-semibold text-rose-400 hover:text-white hover:bg-rose-500 border border-rose-500/30 px-3.5 py-2 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
