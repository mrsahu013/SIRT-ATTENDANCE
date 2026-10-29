
"use client";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, child, remove, set } from "firebase/database";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const [users, setUsers] = useState({});
  const [studentsData, setStudentsData] = useState({});
  const [attendanceData, setAttendanceData] = useState({});
  const [announcementText, setAnnouncementText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Attendance tab state
  const [attSearch, setAttSearch] = useState("");
  const [attDateFilter, setAttDateFilter] = useState("");
  const [attStatusFilter, setAttStatusFilter] = useState("all"); // all | marked | notMarked
  const [expandedCRs, setExpandedCRs] = useState({}); 
  const [expandedRecords, setExpandedRecords] = useState({}); 
  const [refreshing, setRefreshing] = useState(false);

  const router = useRouter();

  const MASTER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL; 
  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
      } else {
        if (user.email !== MASTER_ADMIN_EMAIL) {
          alert("Access Denied: You are not authorized as Administrator.");
          router.push("/");
          return;
        }

        setAdminUser(user);
        await fetchAllSystemData();
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchAllSystemData = async () => {
    const dbRef = ref(db);

    const usersSnap = await get(child(dbRef, "users"));
    setUsers(usersSnap.exists() ? usersSnap.val() : {});

    const studentsSnap = await get(child(dbRef, "students"));
    setStudentsData(studentsSnap.exists() ? studentsSnap.val() : {});

    const attSnap = await get(child(dbRef, "attendance"));
    setAttendanceData(attSnap.exists() ? attSnap.val() : {});
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAllSystemData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteCR = async (uid) => {
    if (
      !confirm(
        "Are you sure you want to delete this CR and their associated data?",
      )
    )
      return;
    try {
      await remove(ref(db, `users/${uid}`));
      await remove(ref(db, `students/${uid}`));
      await remove(ref(db, `attendance/${uid}`));
      alert("CR account and data removed successfully.");
      fetchAllSystemData();
    } catch (err) {
      alert("Error deleting CR: " + err.message);
    }
  };

  const handlePostAnnouncement = async (e) => {
    e.preventDefault();
    if (!announcementText.trim()) return;

    try {
      await set(ref(db, `announcements/global`), {
        message: announcementText,
        timestamp: Date.now(),
      });
      setAnnouncementText("");
      alert("Announcement broadcasted successfully to all CR dashboards!");
    } catch (err) {
      alert("Error broadcasting announcement: " + err.message);
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

  // Calculate total actual students safely
  let totalStudents = 0;
  Object.entries(studentsData).forEach(([crUid, crStudents]) => {
    if (crStudents && typeof crStudents === "object") {
      totalStudents += Object.keys(crStudents).length;
    }
  });

  // Filtered CRs based on search input (CR management tab)
  const filteredCRs = Object.entries(users).filter(([uid, cr]) => {
    const query = searchQuery.toLowerCase();
    return (
      cr.crName?.toLowerCase().includes(query) ||
      cr.crRollNumber?.toLowerCase().includes(query) ||
      cr.collegeName?.toLowerCase().includes(query) ||
      cr.branch?.toLowerCase().includes(query) ||
      cr.email?.toLowerCase().includes(query)
    );
  });

  // ---- Attendance tab data ----
  // How many CRs marked attendance today
  const markedTodayCount = Object.keys(users).filter(
    (uid) => attendanceData[uid] && attendanceData[uid][todayStr],
  ).length;

  // Build per-CR attendance rows (every CR is listed, even without records)
  const attendanceRows = Object.entries(users)
    .map(([uid, cr]) => {
      const records = Object.entries(attendanceData[uid] || {})
        .map(([dateKey, record]) => ({ dateKey, ...record }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // newest first
      return { uid, cr, records };
    })
    .filter(({ cr, records }) => {
      const q = attSearch.toLowerCase();
      const matchesSearch =
        !q ||
        cr.crName?.toLowerCase().includes(q) ||
        cr.crRollNumber?.toLowerCase().includes(q) ||
        cr.collegeName?.toLowerCase().includes(q) ||
        cr.branch?.toLowerCase().includes(q) ||
        cr.section?.toLowerCase().includes(q) ||
        cr.tgName?.toLowerCase().includes(q);

      // Date filter: if a date is picked, show only CRs that marked on that date
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
                  Active Database Nodes
                </p>
                <h3 className="text-3xl font-extrabold text-indigo-400">
                  Firebase RTDB
                </h3>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h2 className="text-lg font-bold text-slate-200 mb-2">
                Platform Status
              </h2>
              <p className="text-sm text-slate-400">
                All services operational. Automatic attendance record pruning
                protocol is active across user instances.
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
              {/* Search Bar Input */}
              <div className="w-full md:w-72">
                <input
                  type="text"
                  placeholder="🔍 Search by CR name, roll, branch..."
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
                const crStudents = studentsData[uid] || {};
                const studentList = Object.entries(crStudents);

                return (
                  <div
                    key={uid}
                    className="border border-slate-800 bg-slate-950/50 rounded-2xl p-5 shadow-md"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-100 text-base">
                            {cr.crName}
                          </h3>
                          <span className="bg-cyan-500/10 text-cyan-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                            CR • Roll: {cr.crRollNumber}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {cr.collegeName} • {cr.branch} (Sec {cr.section}, Year{" "}
                          {cr.year}) • TG: {cr.tgName} •{" "}
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
                              className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs flex justify-between items-center"
                            >
                              <div>
                                <p className="font-medium text-slate-200">
                                  {student.name}
                                </p>
                                <p className="text-slate-400 text-[10px]">
                                  Roll: {student.rollNumber}
                                </p>
                              </div>
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
            {/* Title + refresh */}
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

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="🔍 Search CR, roll, college, branch, TG..."
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

            {/* CR list */}
            <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
              {attendanceRows.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  No matching CRs or attendance logs found.
                </p>
              ) : (
                attendanceRows.map(({ uid, cr, records }) => {
                  const isOpen = !!expandedCRs[uid];
                  const markedToday = records.some(
                    (r) => r.dateKey === todayStr,
                  );
                  const totalStudentsOfCR = Object.keys(
                    studentsData[uid] || {},
                  ).length;

                  // When a date filter is active, only show that day's record
                  const visibleRecords = attDateFilter
                    ? records.filter(
                        (r) =>
                          r.dateKey === attDateFilter ||
                          r.date === attDateFilter,
                      )
                    : records;

                  return (
                    <div
                      key={uid}
                      className="border border-slate-800 bg-slate-950/60 rounded-xl overflow-hidden"
                    >
                      {/* CR header (click to expand) */}
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
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {cr.collegeName} • {cr.branch} Sec {cr.section} •
                            Year {cr.year} • TG: {cr.tgName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
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

                      {/* Records */}
                      {isOpen && (
                        <div className="border-t border-slate-800 p-4 space-y-3">
                          {visibleRecords.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">
                              {attDateFilter
                                ? "No attendance marked on the selected date."
                                : "This CR has not marked any attendance yet."}
                            </p>
                          ) : (
                            visibleRecords.map((record) => {
                              const key = `${uid}_${record.dateKey}`;
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
                                    <span className="text-slate-300 font-medium">
                                      📅 {record.date || record.dateKey}
                                      {record.timestamp && (
                                        <span className="text-slate-500 font-normal ml-2">
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
                                      {/* Present - green */}
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

                                      {/* Absent - red */}
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
              Send a notice that will display across all active CR dashboards.
            </p>
            <form onSubmit={handlePostAnnouncement} className="space-y-4">
              <textarea
                rows="4"
                placeholder="Enter announcement message..."
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                required
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
