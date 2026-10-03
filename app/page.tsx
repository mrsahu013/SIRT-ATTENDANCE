// app/page.js
'use client';
import { useState, useEffect, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, set, get, child, push, remove } from 'firebase/database';
import { useRouter } from 'next/navigation';
import html2canvas from 'html2canvas';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [crData, setCrData] = useState(null);
  const [students, setStudents] = useState({});
  const [studentName, setStudentName] = useState('');
  const [studentRoll, setStudentRoll] = useState('');
  
  const todayStr = new Date().toISOString().split('T')[0];
  const MASTER_ADMIN_EMAIL = "mrsahu@gmail.com"; // Change to your admin email

  // Attendance state
  const [attendance, setAttendance] = useState({});
  const [markedDate, setMarkedDate] = useState(todayStr);
  const [submittedAttendance, setSubmittedAttendance] = useState(null);
  const exportRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setLoadingAuth(false);
        setUser(null);
      } else {
        setUser(currentUser);
        setLoadingAuth(false);
        const dbRef = ref(db);
        
        // Fetch CR Profile
        const crSnap = await get(child(dbRef, `users/${currentUser.uid}`));
        if (crSnap.exists()) setCrData(crSnap.val());

        // Fetch Students
        const studentsSnap = await get(child(dbRef, `students/${currentUser.uid}`));
        if (studentsSnap.exists()) {
          const fetchedStudents = studentsSnap.val();
          setStudents(fetchedStudents);
          const initialAtt = {};
          Object.keys(fetchedStudents).forEach(id => {
            initialAtt[id] = true;
          });
          setAttendance(initialAtt);
        }

        // Fetch Attendance (with 2-day auto-cleanup check)
        const attSnap = await get(child(dbRef, `attendance/${currentUser.uid}`));
        if (attSnap.exists()) {
          const attData = attSnap.val();
          const now = Date.now();
          const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

          Object.entries(attData).forEach(async ([dateKey, record]) => {
            if (now - record.timestamp > twoDaysMs) {
              await remove(ref(db, `attendance/${currentUser.uid}/${dateKey}`));
            }
          });
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!user) return;

    const existingRolls = Object.values(students).map(s => s.rollNumber);
    if (existingRolls.includes(studentRoll)) {
      alert("Error: This Roll Number already exists in your list!");
      return;
    }

    const newStudentRef = push(ref(db, `students/${user.uid}`));
    await set(newStudentRef, { name: studentName, rollNumber: studentRoll });

    setStudents({ ...students, [newStudentRef.key]: { name: studentName, rollNumber: studentRoll } });
    setAttendance({ ...attendance, [newStudentRef.key]: true });
    setStudentName('');
    setStudentRoll('');
  };

  const handleAttendanceChange = (id) => {
    setAttendance({ ...attendance, [id]: !attendance[id] });
  };

  const submitAttendance = async () => {
    if (!user) return;
    const presentList = [];
    const absentList = [];

    const sortedStudentEntries = Object.entries(students).sort((a, b) => 
      a[1].rollNumber.localeCompare(b[1].rollNumber, undefined, { numeric: true })
    );

    sortedStudentEntries.forEach(([id, s]) => {
      if (attendance[id]) {
        presentList.push({ roll: s.rollNumber, name: s.name });
      } else {
        absentList.push({ roll: s.rollNumber, name: s.name });
      }
    });

    const attendanceRecord = {
      date: markedDate,
      timestamp: Date.now(),
      present: presentList,
      absent: absentList
    };

    await set(ref(db, `attendance/${user.uid}/${markedDate}`), attendanceRecord);
    setSubmittedAttendance(attendanceRecord);
    alert("Attendance Saved Successfully! Valid for 2 days.");
  };

  const downloadJPG = async () => {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, { scale: 2 });
    const image = canvas.toDataURL("image/jpeg", 1.0);
    const link = document.createElement('a');
    link.href = image;
    const crRoll = crData?.crRollNumber || 'CR';
    link.download = `Attendance_${crRoll}_${markedDate}.jpg`;
    link.click();
  };

  const copyWhatsAppText = () => {
    if (!submittedAttendance) return;
    const presentRollsStr = submittedAttendance.present
      .map(p => p.roll.slice(-3))
      .join(', ');
    
    const text = `📋 *ATTENDANCE REPORT* 📋\n` +
                 `🏫 *College:* ${crData?.collegeName}\n` +
                 `📚 *Class:* ${crData?.branch} - Sec ${crData?.section} (${crData?.year})\n` +
                 `📅 *Date:* ${submittedAttendance.date}\n` +
                 `👨‍🏫 *TG:* ${crData?.tgName}\n\n` +
                 `Total Present: ${submittedAttendance.present.length} / ${Object.keys(students).length}\n\n` +
                 `*Present Roll Nos*\n` +
                 `${presentRollsStr}`;
    
    navigator.clipboard.writeText(text);
    alert("Attendance text copied to clipboard for WhatsApp!");
  };

  const sortedStudentsList = Object.entries(students).sort((a, b) => 
    a[1].rollNumber.localeCompare(b[1].rollNumber, undefined, { numeric: true })
  );

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400 text-sm">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">
            CR Attendance Portal
          </h1>
          <p className="text-slate-400 text-sm mb-6">Manage your class attendance and records efficiently.</p>
          <div className="flex flex-col gap-3">
            <a 
              href="/login" 
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white p-3.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20 block">
              Login to Dashboard
            </a>
            <a 
              href="/register" 
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-3.5 rounded-xl font-semibold hover:bg-slate-700 transition-all block">
              Register as CR
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      {/* Header */}
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            CR Portal Dashboard
          </h1>
          {crData && (
            <p className="text-slate-400 text-sm mt-1">
              <span className="text-slate-200 font-medium">{crData.crName}</span> (Roll: {crData.crRollNumber}) | {crData.collegeName} | {crData.branch} Sec {crData.section}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {user?.email === MASTER_ADMIN_EMAIL && (
            <button 
              onClick={() => router.push('/admin')} 
              className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-cyan-500 hover:text-slate-950 transition-all shadow-lg shadow-cyan-900/10">
              Admin Panel
            </button>
          )}
          <button 
            onClick={() => signOut(auth).then(() => setUser(null))} 
            className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-rose-500 hover:text-white transition-all">
            Logout
          </button>
        </div>
      </div>

      {/* Add Student Section */}
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-slate-200">Add Student to Class List</h2>
        <form onSubmit={handleAddStudent} className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Student Name" 
            value={studentName} 
            onChange={(e) => setStudentName(e.target.value)} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 flex-1" 
          />
          <input 
            type="text" 
            placeholder="Unique Roll Number" 
            value={studentRoll} 
            onChange={(e) => setStudentRoll(e.target.value)} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 sm:w-48" 
          />
          <button type="submit" className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-lg shadow-emerald-900/20">
            Add Student
          </button>
        </form>
      </div>

      {/* Student List Display */}
      {sortedStudentsList.length > 0 && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-slate-200">Enrolled Students ({sortedStudentsList.length})</h2>
          <div className="overflow-x-auto max-h-60 overflow-y-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-xs">
                  <th className="p-3">Roll Number</th>
                  <th className="p-3">Student Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {sortedStudentsList.map(([id, s]) => (
                  <tr key={id} className="hover:bg-slate-950/40">
                    <td className="p-3 font-semibold text-cyan-400">{s.rollNumber}</td>
                    <td className="p-3 text-slate-300">{s.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance Marking Section */}
      {sortedStudentsList.length > 0 && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-200">Mark Attendance</h2>
            <input 
              type="date" 
              value={markedDate} 
              min={todayStr}
              max={todayStr}
              onChange={(e) => setMarkedDate(e.target.value)} 
              className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 cursor-not-allowed" 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto mb-4 border border-slate-800/80 p-4 rounded-xl bg-slate-950/50">
            {sortedStudentsList.map(([id, s]) => (
              <label key={id} className="flex items-center justify-between bg-slate-900/80 border border-slate-800 p-3 rounded-xl cursor-pointer hover:border-cyan-500/50 transition-all">
                <span className="text-sm font-medium text-slate-300">{s.rollNumber} - {s.name}</span>
                <input 
                  type="checkbox" 
                  checked={attendance[id] ?? true} 
                  onChange={() => handleAttendanceChange(id)} 
                  className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
                />
              </label>
            ))}
          </div>

          <button onClick={submitAttendance} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20">
            Save Attendance
          </button>
        </div>
      )}

      {/* Export Actions */}
      {submittedAttendance && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-xl p-6 text-center mb-6">
          <h3 className="text-lg font-bold text-cyan-400 mb-2">Attendance Recorded Successfully!</h3>
          <p className="text-xs text-slate-400 mb-4">Saved securely and set to expire automatically in 48 hours.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button onClick={downloadJPG} className="bg-indigo-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-900/20">
              Download JPG Image
            </button>
            <button onClick={copyWhatsAppText} className="bg-emerald-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20">
              Copy WhatsApp Text
            </button>
          </div>
        </div>
      )}

      {/* Hidden Card Template for html2canvas JPG Export */}
      <div style={{ position: 'absolute', left: '-9999px' }}>
        <div ref={exportRef} style={{ width: '600px', padding: '30px', background: 'white', color: 'black', fontFamily: 'Arial, sans-serif' }}>
          <h2 style={{ textAlign: 'center', color: '#1e3a8a', margin: '0 0 10px 0' }}>{crData?.collegeName}</h2>
          <p style={{ textAlign: 'center', fontSize: '14px', color: '#4b5563', margin: '0 0 20px 0' }}>
            Branch: {crData?.branch} | Sec: {crData?.section} | Year: {crData?.year} | TG: {crData?.tgName}
          </p>
          <hr style={{ border: '1px solid #e5e7eb', marginBottom: '20px' }} />
          <h3 style={{ margin: '0 0 10px 0' }}>Attendance Report - {submittedAttendance?.date}</h3>
          <p><strong>CR Name:</strong> {crData?.crName} ({crData?.crRollNumber})</p>
          <p><strong>Total Present:</strong> {submittedAttendance?.present.length} / {Object.keys(students).length}</p>
          
          <div style={{ marginTop: '20px', background: '#f3f4f6', padding: '15px', borderRadius: '8px' }}>
            <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>Present Students (Serial & Roll Number):</p>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
              {submittedAttendance?.present.map((p, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>
                  {idx + 1}. {p.roll} - {p.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}