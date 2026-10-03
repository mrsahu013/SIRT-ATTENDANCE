// app/admin/page.js
'use client';
import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, get, child, remove, set } from 'firebase/database';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const [users, setUsers] = useState({});
  const [studentsData, setStudentsData] = useState({});
  const [attendanceData, setAttendanceData] = useState({});
  const [announcementText, setAnnouncementText] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // Added search state
  const router = useRouter();

  const MASTER_ADMIN_EMAIL = "mrsahu@gmail.com"; // Your admin email

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
      } else {
        if (user.email !== MASTER_ADMIN_EMAIL) {
          alert("Access Denied: You are not authorized as Administrator.");
          router.push('/');
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
    
    const usersSnap = await get(child(dbRef, 'users'));
    if (usersSnap.exists()) setUsers(usersSnap.val());

    const studentsSnap = await get(child(dbRef, 'students'));
    if (studentsSnap.exists()) setStudentsData(studentsSnap.val());

    const attSnap = await get(child(dbRef, 'attendance'));
    if (attSnap.exists()) setAttendanceData(attSnap.val());
  };

  const handleDeleteCR = async (uid) => {
    if (!confirm("Are you sure you want to delete this CR and their associated data?")) return;
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
        timestamp: Date.now()
      });
      setAnnouncementText('');
      alert("Announcement broadcasted successfully to all CR dashboards!");
    } catch (err) {
      alert("Error broadcasting announcement: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400 text-sm">Verifying Admin Privileges...</p>
        </div>
      </div>
    );
  }

  const totalCRs = Object.keys(users).length;
  
  // Calculate total actual students safely
  let totalStudents = 0;
  Object.entries(studentsData).forEach(([crUid, crStudents]) => {
    if (crStudents && typeof crStudents === 'object') {
      totalStudents += Object.keys(crStudents).length;
    }
  });

  // Filtered CRs based on search input
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
          <p className="text-slate-400 text-sm mt-1">Logged in as Administrator ({adminUser?.email})</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push('/')} 
            className="bg-slate-800 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-all">
            Back to Home
          </button>
          <button 
            onClick={() => signOut(auth).then(() => router.push('/login'))} 
            className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-rose-500 hover:text-white transition-all">
            Logout Admin
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-4">
        {[
          { id: 'overview', label: '📊 System Overview' },
          { id: 'crs', label: '👥 CR & Student Management' },
          { id: 'attendance', label: '📋 Attendance Logs' },
          { id: 'broadcast', label: '📢 Broadcasts' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Total Registered CRs</p>
                <h3 className="text-3xl font-extrabold text-cyan-400">{totalCRs}</h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Total Enrolled Students</p>
                <h3 className="text-3xl font-extrabold text-emerald-400">{totalStudents}</h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Active Database Nodes</p>
                <h3 className="text-3xl font-extrabold text-indigo-400">Firebase RTDB</h3>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h2 className="text-lg font-bold text-slate-200 mb-2">Platform Status</h2>
              <p className="text-sm text-slate-400">All services operational. Automatic attendance record pruning protocol is active across user instances.</p>
            </div>
          </div>
        )}

        {activeTab === 'crs' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h2 className="text-lg font-bold text-slate-200">
                Class Representatives & Rosters ({filteredCRs.length} / {totalCRs})
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
              <p className="text-sm text-slate-400 text-center py-6">No matching Class Representatives found.</p>
            ) : (
              filteredCRs.map(([uid, cr]) => {
                const crStudents = studentsData[uid] || {};
                const studentList = Object.entries(crStudents);

                return (
                  <div key={uid} className="border border-slate-800 bg-slate-950/50 rounded-2xl p-5 shadow-md">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-100 text-base">{cr.crName}</h3>
                          <span className="bg-cyan-500/10 text-cyan-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                            CR • Roll: {cr.crRollNumber}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {cr.collegeName} • {cr.branch} (Sec {cr.section}, Year {cr.year}) • TG: {cr.tgName} • <span className="text-slate-500">{cr.email}</span>
                        </p>
                      </div>
                      <button 
                        onClick={() => handleDeleteCR(uid)}
                        className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-rose-500 hover:text-white transition-all">
                        Delete CR & Data
                      </button>
                    </div>

                    <div className="mt-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Enrolled Students ({studentList.length})
                      </h4>
                      {studentList.length === 0 ? (
                        <p className="text-xs text-slate-500 italic bg-slate-900/50 p-3 rounded-xl border border-slate-800/60">No students added under this CR yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
                          {studentList.map(([studentId, student]) => (
                            <div key={studentId} className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs flex justify-between items-center">
                              <div>
                                <p className="font-medium text-slate-200">{student.name}</p>
                                <p className="text-slate-400 text-[10px]">Roll: {student.rollNumber}</p>
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

        {activeTab === 'attendance' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-slate-200 mb-4">System-Wide Attendance Archive</h2>
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {Object.entries(attendanceData).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No attendance logs found in the database.</p>
              ) : (
                Object.entries(attendanceData).map(([crUid, dates]) => {
                  const cr = users[crUid] || {};
                  return (
                    <div key={crUid} className="border border-slate-800 bg-slate-950/60 p-4 rounded-xl">
                      <h4 className="font-semibold text-cyan-400 text-sm mb-2">{cr.crName || 'Unknown CR'} — {cr.collegeName} ({cr.branch} Sec {cr.section})</h4>
                      <div className="space-y-2 mt-3">
                        {Object.entries(dates).map(([dateKey, record]) => (
                          <div key={dateKey} className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs">
                            <span className="text-slate-300 font-medium">📅 Date: {record.date}</span>
                            <span className="text-emerald-400">Present: {record.present?.length || 0}</span>
                            <span className="text-rose-400">Absent: {record.absent?.length || 0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'broadcast' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 max-w-xl mx-auto">
            <h2 className="text-lg font-bold text-slate-200 mb-2">Broadcast System Announcement</h2>
            <p className="text-xs text-slate-400 mb-4">Send a notice that will display across all active CR dashboards.</p>
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
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20">
                Broadcast Announcement
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}