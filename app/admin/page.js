"use client";
import { useState, useEffect, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, child, remove, set, update } from "firebase/database";
import { useRouter } from "next/navigation";
import { getLocalDate, formatDate } from "@/lib/dateUtils";
import { RETENTION_DAYS, MAX_SEMESTER } from "@/lib/config";

// Flat shared roster per CR. Handles legacy / intermediate sem-nested data too.
const rosterForCR = (studentsNode) => {
  const node = studentsNode || {};
  const out = [];
  Object.entries(node).forEach(([sid, s]) => {
    if (s && s.name) {
      out.push([sid, s]);
    } else if (/^sem[1-8]$/.test(sid) && s && typeof s === "object") {
      // Intermediate format: merge sem children back into the flat list
      Object.entries(s).forEach(([sid2, s2]) => {
        if (s2 && s2.name) out.push([sid2, s2]);
      });
    }
  });
  return out;
};

const countStudentsForCR = (studentsNode) => rosterForCR(studentsNode).length;

// Flat [{dateKey, sem, ...record}] list (newest first). Handles legacy flat records.
const recordsForCR = (attNode) => {
  const node = attNode || {};
  const out = [];
  Object.entries(node).forEach(([k, v]) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
      // Legacy flat record -> Semester 1
      out.push({ dateKey: k, sem: 1, ...(v || {}) });
      return;
    }
    const semNum = parseInt(k.replace("sem", ""), 10) || 1;
    Object.entries(v || {}).forEach(([dateKey, record]) => {
      out.push({ dateKey, sem: semNum, ...(record || {}) });
    });
  });
  return out.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
};

export default function AdminDashboard() {
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const [users, setUsers] = useState({});
  const [studentsData, setStudentsData] = useState({});
  const [attendanceData, setAttendanceData] = useState({});
  const [currentAnnouncement, setCurrentAnnouncement] = useState(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Attendance tab state
  const [attSearch, setAttSearch] = useState("");
  const [attDateFilter, setAttDateFilter] = useState("");
  const [attStatusFilter, setAttStatusFilter] = useState("all"); // all | marked | notMarked
  const [attSemFilter, setAttSemFilter] = useState("all"); // all | 1..8
  const [expandedCRs, setExpandedCRs] = useState({});
  const [expandedRecords, setExpandedRecords] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  // Toast (replaces alert)
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const router = useRouter();

  const MASTER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL;
  const todayStr = getLocalDate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const isAdmin =
        !!MASTER_ADMIN_EMAIL &&
        !!user.email &&
        user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();

      if (!isAdmin) {
        router.push("/");
        return;
      }

      setAdminUser(user);
      try {
        await fetchAllSystemData();
      } catch (err) {
        console.error(err);
        showToast("Could not load system data: " + err.message, "error");
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchAllSystemData = async () => {
    const dbRef = ref(db);
    const [usersSnap, studentsSnap, attSnap, annSnap] = await Promise.all([
      get(child(dbRef, "users")),
      get(child(dbRef, "students")),
      get(child(dbRef, "attendance")),
      get(child(dbRef, "announcements/global")),
    ]);
    setUsers(usersSnap.exists() ? usersSnap.val() : {});
    setStudentsData(studentsSnap.exists() ? studentsSnap.val() : {});
    setAttendanceData(attSnap.exists() ? attSnap.val() : {});
    setCurrentAnnouncement(annSnap.exists() ? annSnap.val() : null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAllSystemData();
      showToast("Data refreshed.");
    } catch (err) {
      showToast("Refresh failed: " + err.message, "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteCR = async (uid) => {
    if (
      !confirm(
        "Delete this CR's profile, students and attendance records? (Their login account stays in Firebase Authentication.)",
      )
    )
      return;
    try {
      // One atomic multi-path delete
      const updates = {
        [`users/${uid}`]: null,
        [`students/${uid}`]: null,
        [`attendance/${uid}`]: null,
      };
      if (users[uid]?.userId) updates[`userIds/${users[uid].userId}`] = null;
      await update(ref(db), updates);
      showToast("CR data removed successfully.");
      await fetchAllSystemData();
    } catch (err) {
      showToast("Error deleting CR: " + err.message, "error");
    }
  };

  const handlePostAnnouncement = async (e) => {
    e.preventDefault();
    if (!announcementText.trim()) return;

    try {
      const payload = {
        message: announcementText.trim(),
        timestamp: Date.now(),
      };
      await set(ref(db, `announcements/global`), payload);
      setCurrentAnnouncement(payload);
      setAnnouncementText("");
      showToast("Announcement broadcasted to all CR dashboards!");
    } catch (err) {
      showToast("Error broadcasting announcement: " + err.message, "error");
    }
  };

  const handleClearAnnouncement = async () => {
    if (!confirm("Remove the current announcement from all dashboards?"))
      return;
    try {
      await remove(ref(db, "announcements/global"));
      setCurrentAnnouncement(null);
      showToast("Announcement removed.");
    } catch (err) {
      showToast("Error removing announcement: " + err.message, "error");
    }
  };

  const toggleCR = (uid) => {
    setExpandedCRs((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const toggleRecord = (key) => {
    setExpandedRecords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400 text-sm">
            Verifying Admin Privileges...
          </p>
        </div>
      </div>
    );
  }

  const totalCRs = Object.keys(users).length;

  // Total students across all CRs (shared rosters)
  let totalStudents = 0;
  Object.values(studentsData).forEach((crNode) => {
    if (crNode && typeof crNode === "object") {
      totalStudents += countStudentsForCR(crNode);
    }
  });

  const filteredCRs = Object.entries(users).filter(([uid, cr]) => {
    const query = searchQuery.toLowerCase();
    return (
      cr.userId?.toLowerCase().includes(query) ||
      uid.toLowerCase() === query ||
      cr.crName?.toLowerCase().includes(query) ||
      cr.crRollNumber?.toLowerCase().includes(query) ||
      cr.collegeName?.toLowerCase().includes(query) ||
      cr.branch?.toLowerCase().includes(query) ||
      cr.email?.toLowerCase().includes(query)
    );
  });

  // CRs who marked attendance today (any semester)
  const markedTodayCount = Object.keys(users).filter((uid) =>
    recordsForCR(attendanceData[uid]).some((r) => r.dateKey === todayStr),
  ).length;

  const semOptions = Array.from({ length: MAX_SEMESTER }, (_, i) => i + 1);

  const attendanceRows = Object.entries(users)
    .map(([uid, cr]) => {
      let records = recordsForCR(attendanceData[uid]);
      if (attSemFilter !== "all") {
        records = records.filter((r) => r.sem === Number(attSemFilter));
      }
      return { uid, cr, records };
    })
    .filter(({ cr, records }) => {
      const q = attSearch.toLowerCase();
      const matchesSearch =
        !q ||
        cr.userId?.toLowerCase().includes(q) ||
        cr.crName?.toLowerCase().includes(q) ||
        cr.crRollNumber?.toLowerCase().includes(q) ||
        cr.collegeName?.toLowerCase().includes(q) ||
        cr.branch?.toLowerCase().includes(q) ||
        cr.section?.toLowerCase().includes(q) ||
        cr.tgName?.toLowerCase().includes(q);

      const marked = attDateFilter
        ? records.some(
            (r) => r.dateKey === attDateFilter || r.date === attDateFilter,
          )
        : records.length > 0;

      const matchesStatus =
        attStatusFilter === "all" ||
        (attStatusFilter === "marked" && marked) ||
        (attStatusFilter === "notMarked" && !marked);

      return matchesSearch && matchesStatus;
    });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl border ${
            toast.type === "error"
              ? "bg-rose-950 text-rose-200 border-rose-500/50"
              : "bg-emerald-950 text-emerald-200 border-emerald-500/50"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="max-w-6xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="bg-cyan-500/10 text-cyan-400 text-xs font-bold px-3 py-1 rounded-full border border-cyan-500/20 uppercase tracking-wider">
            Master Control
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mt-2">
            Admin Command Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Logged in as Administrator ({adminUser?.email})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="bg-slate-800 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-all"
          >
            Back to Home
          </button>
          <button
            onClick={() => signOut(auth).then(() => router.push("/login"))}
            className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-rose-500 hover:text-white transition-all"
          >
            Logout Admin
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-4">
        {[
          { id: "overview", label: "📊 System Overview" },
          { id: "crs", label: "👥 CR & Student Management" },
          { id: "attendance", label: "📋 Attendance Logs" },
          { id: "broadcast", label: "📢 Broadcasts" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">
                  Total Registered CRs
                </p>
                <h3 className="text-3xl font-extrabold text-cyan-400">
                  {totalCRs}
                </h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">
                  Total Enrolled Students
                </p>
                <h3 className="text-3xl font-extrabold text-emerald-400">
                  {totalStudents}
                </h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">
                  Marked Today
                </p>
                <h3 className="text-3xl font-extrabold text-amber-400">
                  {markedTodayCount}{" "}
                  <span className="text-lg text-slate-500">/ {totalCRs}</span>
                </h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">
                  Record Retention
                </p>
                <h3 className="text-3xl font-extrabold text-indigo-400">
                  {RETENTION_DAYS}
                  <span className="text-lg text-slate-500"> days</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  6 months, semester-wise (1-8)
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h2 className="text-lg font-bold text-slate-200 mb-2">
                Platform Status
              </h2>
              <p className="text-sm text-slate-400">
                All services operational. Student lists are shared per CR;
                attendance is stored semester-wise (sem1&ndash;sem8) and kept
                for {RETENTION_DAYS} days (6 months). Older records are cleaned
                up when a CR opens their dashboard.
              </p>
            </div>
          </div>
        )}

        {activeTab === "crs" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h2 className="text-lg font-bold text-slate-200">
                Class Representatives & Rosters ({filteredCRs.length} /{" "}
                {totalCRs})
              </h2>
              <div className="w-full md:w-72">
                <input
                  type="text"
                  placeholder="🔍 Search by User ID (10 digits), name, roll..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
                />
              </div>
            </div>

            {filteredCRs.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                No matching Class Representatives found.
              </p>
            ) : (
              filteredCRs.map(([uid, cr]) => {
                const studentList = rosterForCR(studentsData[uid]);

                return (
                  <div
                    key={uid}
                    className="border border-slate-800 bg-slate-950/50 rounded-2xl p-5 shadow-md"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-100 text-base">
                            {cr.crName}
                          </h3>
                          <span className="bg-cyan-500/10 text-cyan-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                            CR • Roll: {cr.crRollNumber}
                          </span>
                          {cr.semester && (
                            <span className="bg-emerald-500/10 text-emerald-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                              Default Sem {cr.semester}
                            </span>
                          )}
                          {cr.userId ? (
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(cr.userId);
                                showToast(`Copied ${cr.userId}`);
                              }}
                              title="Click to copy"
                              className="bg-indigo-500/10 text-indigo-300 text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full border border-indigo-500/30 hover:bg-indigo-500 hover:text-white transition-all"
                            >
                              {cr.userId}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500 italic">
                              ID pending (assigned on next login)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {cr.collegeName} • {cr.branch} (Sec {cr.section}) • TG: {cr.tgName} •{" "}
                          <span className="text-slate-500">{cr.email}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteCR(uid)}
                        className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-rose-500 hover:text-white transition-all"
                      >
                        Delete CR & Data
                      </button>
                    </div>

                    <div className="mt-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Enrolled Students ({studentList.length})
                      </h4>
                      {studentList.length === 0 ? (
                        <p className="text-xs text-slate-500 italic bg-slate-900/50 p-3 rounded-xl border border-slate-800/60">
                          No students added under this CR yet.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
                          {studentList.map(([studentId, student]) => (
                            <div
                              key={studentId}
                              className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs"
                            >
                              <p className="font-medium text-slate-200">
                                {student.name}
                              </p>
                              <p className="text-slate-400 text-[10px]">
                                Roll: {student.rollNumber}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "attendance" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 space-y-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-200">
                  Attendance Marked by Each CR
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Showing {attendanceRows.length} of {totalCRs} CRs • Marked
                  today:{" "}
                  <span className="text-amber-400 font-semibold">
                    {markedTodayCount}
                  </span>
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
              >
                {refreshing ? "Refreshing..." : "🔄 Refresh"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="🔍 Search CR, ID, roll, college..."
                value={attSearch}
                onChange={(e) => setAttSearch(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={attDateFilter}
                  onChange={(e) => setAttDateFilter(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-all"
                />
                {attDateFilter && (
                  <button
                    onClick={() => setAttDateFilter("")}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 rounded-xl text-xs transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
              <select
                value={attSemFilter}
                onChange={(e) => setAttSemFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-all"
              >
                <option value="all">All semesters</option>
                {semOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    Semester {n}
                  </option>
                ))}
              </select>
              <select
                value={attStatusFilter}
                onChange={(e) => setAttStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-all"
              >
                <option value="all">All CRs</option>
                <option value="marked">
                  {attDateFilter
                    ? "Marked on selected date"
                    : "Has marked attendance"}
                </option>
                <option value="notMarked">
                  {attDateFilter
                    ? "Not marked on selected date"
                    : "No attendance marked"}
                </option>
              </select>
            </div>

            <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
              {attendanceRows.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  No matching CRs or attendance logs found.
                </p>
              ) : (
                attendanceRows.map(({ uid, cr, records }) => {
                  const isOpen = !!expandedCRs[uid];
                  // "Marked today" is per-CR truth, independent of the semester filter
                  const markedToday = recordsForCR(attendanceData[uid]).some(
                    (r) => r.dateKey === todayStr,
                  );
                  const totalStudentsOfCR = countStudentsForCR(
                    studentsData[uid],
                  );

                  return (
                    <div
                      key={uid}
                      className="border border-slate-800 bg-slate-950/60 rounded-xl overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => toggleCR(uid)}
                        className="w-full flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 text-left hover:bg-slate-900/60 transition-all"
                      >
                        <div>
                          <h4 className="font-semibold text-cyan-400 text-sm">
                            {cr.crName || "Unknown CR"}{" "}
                            <span className="text-slate-500 font-normal text-xs">
                              ({cr.crRollNumber})
                            </span>
                            {cr.userId && (
                              <span className="ml-2 text-indigo-300 font-mono text-xs">
                                {cr.userId}
                              </span>
                            )}
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {cr.collegeName} • {cr.branch} Sec {cr.section} •
                             TG: {cr.tgName}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-slate-400">
                            {totalStudentsOfCR} students
                          </span>
                          {markedToday ? (
                            <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold">
                              ✓ Marked today
                            </span>
                          ) : (
                            <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2.5 py-0.5 rounded-full font-semibold">
                              Not marked today
                            </span>
                          )}
                          <span className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                            {records.length} record
                            {records.length === 1 ? "" : "s"}
                          </span>
                          <span className="text-slate-400">
                            {isOpen ? "▲" : "▼"}
                          </span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-slate-800 p-4 space-y-3">
                          {records.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">
                              {attDateFilter
                                ? "No attendance marked on the selected date."
                                : "This CR has not marked any attendance yet."}
                            </p>
                          ) : (
                            records.map((record) => {
                              const key = `${uid}_${record.sem}_${record.dateKey}`;
                              const recOpen = !!expandedRecords[key];
                              const presentList = record.present || [];
                              const absentList = record.absent || [];
                              const total =
                                presentList.length + absentList.length;
                              const percent =
                                total > 0
                                  ? Math.round(
                                      (presentList.length / total) * 100,
                                    )
                                  : 0;

                              return (
                                <div
                                  key={key}
                                  className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden"
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleRecord(key)}
                                    className="w-full flex flex-wrap justify-between items-center gap-2 p-2.5 text-xs text-left hover:bg-slate-800/60 transition-all"
                                  >
                                    <span className="text-slate-300 font-medium flex items-center gap-2">
                                      <span className="bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-semibold">
                                        Sem {record.sem}
                                      </span>
                                      📅{" "}
                                      {formatDate(
                                        record.date || record.dateKey,
                                      )}
                                      {record.timestamp && (
                                        <span className="text-slate-500 font-normal">
                                          saved{" "}
                                          {new Date(
                                            record.timestamp,
                                          ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      )}
                                    </span>
                                    <span className="flex items-center gap-3">
                                      <span className="text-emerald-400">
                                        Present: {presentList.length}
                                      </span>
                                      <span className="text-rose-400">
                                        Absent: {absentList.length}
                                      </span>
                                      <span className="text-slate-400">
                                        {percent}%
                                      </span>
                                      <span className="text-slate-400">
                                        {recOpen ? "▲" : "▼"}
                                      </span>
                                    </span>
                                  </button>

                                  {recOpen && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-slate-800">
                                      <div className="border border-emerald-500/40 rounded-lg overflow-hidden">
                                        <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5">
                                          Present ({presentList.length})
                                        </div>
                                        <div className="max-h-56 overflow-y-auto">
                                          {presentList.length === 0 ? (
                                            <p className="p-2.5 text-xs text-slate-400">
                                              No present students
                                            </p>
                                          ) : (
                                            presentList.map((p, idx) => (
                                              <div
                                                key={idx}
                                                className="px-3 py-1.5 text-xs bg-emerald-500/20 text-emerald-100 border-b border-emerald-900/40 last:border-b-0"
                                              >
                                                <span className="font-mono font-semibold">
                                                  {p.roll}
                                                </span>{" "}
                                                - {p.name}
                                              </div>
                                            ))
                                          )}
                                        </div>
                                      </div>

                                      <div className="border border-rose-500/40 rounded-lg overflow-hidden">
                                        <div className="bg-rose-600 text-white text-xs font-bold px-3 py-1.5">
                                          Absent ({absentList.length})
                                        </div>
                                        <div className="max-h-56 overflow-y-auto">
                                          {absentList.length === 0 ? (
                                            <p className="p-2.5 text-xs text-slate-400">
                                              No absent students 🎉
                                            </p>
                                          ) : (
                                            absentList.map((a, idx) => (
                                              <div
                                                key={idx}
                                                className="px-3 py-1.5 text-xs bg-rose-500/20 text-rose-100 border-b border-rose-900/40 last:border-b-0"
                                              >
                                                <span className="font-mono font-semibold">
                                                  {a.roll}
                                                </span>{" "}
                                                - {a.name}
                                              </div>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === "broadcast" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 max-w-xl mx-auto">
            <h2 className="text-lg font-bold text-slate-200 mb-2">
              Broadcast System Announcement
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Send a notice that will display on all CR dashboards. A new
              announcement replaces the old one.
            </p>

            {currentAnnouncement?.message && (
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <p className="text-xs font-bold text-amber-400 mb-1">
                  Currently live:
                </p>
                <p className="text-sm text-amber-100 whitespace-pre-wrap">
                  {currentAnnouncement.message}
                </p>
                <button
                  type="button"
                  onClick={handleClearAnnouncement}
                  className="mt-2 text-xs text-rose-400 hover:text-white hover:bg-rose-500 border border-rose-500/30 px-3 py-1 rounded-lg transition-all"
                >
                  Remove announcement
                </button>
              </div>
            )}

            <form onSubmit={handlePostAnnouncement} className="space-y-4">
              <textarea
                rows="4"
                placeholder="Enter announcement message..."
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                required
                maxLength={500}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20"
              >
                Broadcast Announcement
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
