// app/page.jsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, set, get, child, push, update, remove } from 'firebase/database';
import { useRouter } from 'next/navigation';
import html2canvas from 'html2canvas';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [crData, setCrData] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [students, setStudents] = useState({});
  const [studentName, setStudentName] = useState('');
  const [studentRoll, setStudentRoll] = useState('');
  
  // Edit student state
  const [editingStudentId, setEditingStudentId] = useState(null);
  
  // Bulk upload state
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState([]);
  const fileInputRef = useRef(null);
  
  // Roll range generator state
  const [rollPrefix, setRollPrefix] = useState('0133CI25');
  const [rangeStart, setRangeStart] = useState('1178');
  const [rangeEnd, setRangeEnd] = useState('1250');
  const [showGenerator, setShowGenerator] = useState(false);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const MASTER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL;

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
        setHasProfile(false);
        router.push('/login');
      } else {
        setUser(currentUser);
        const dbRef = ref(db);
        
        // Fetch CR Profile from database
        const crSnap = await get(child(dbRef, `users/${currentUser.uid}`));
        
        // Check if profile exists and has tgName
        if (!crSnap.exists() || !crSnap.val().tgName) {
          setHasProfile(false);
          setLoadingAuth(false);
          await signOut(auth);
          router.push('/login');
          return;
        }

        // Profile and tgName exist
        setHasProfile(true);
        setCrData(crSnap.val());
        setLoadingAuth(false);

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

  const handleAddOrUpdateStudent = async (e) => {
    e.preventDefault();
    if (!user || !hasProfile) {
      alert("Error: You must complete your CR registration first!");
      router.push('/login');
      return;
    }

    const duplicateEntry = Object.entries(students).find(
      ([id, s]) => s.rollNumber === studentRoll && id !== editingStudentId
    );
    if (duplicateEntry) {
      alert("Error: This Roll Number already exists in your list!");
      return;
    }

    if (editingStudentId) {
      const studentRef = ref(db, `students/${user.uid}/${editingStudentId}`);
      await update(studentRef, { name: studentName, rollNumber: studentRoll });

      setStudents(prev => ({
        ...prev,
        [editingStudentId]: { name: studentName, rollNumber: studentRoll }
      }));
      
      setEditingStudentId(null);
    } else {
      const newStudentRef = push(ref(db, `students/${user.uid}`));
      await set(newStudentRef, { name: studentName, rollNumber: studentRoll });

      setStudents(prev => ({ ...prev, [newStudentRef.key]: { name: studentName, rollNumber: studentRoll } }));
      setAttendance(prev => ({ ...prev, [newStudentRef.key]: true }));
    }

    setStudentName('');
    setStudentRoll('');
  };

  // Generate roll numbers from range
  const generateRollRange = () => {
    const start = parseInt(rangeStart, 10);
    const end = parseInt(rangeEnd, 10);

    if (isNaN(start) || isNaN(end) || start > end) {
      setDuplicateWarnings(['❌ Invalid range! Start must be smaller than End.']);
      return;
    }
    if (end - start > 300) {
      setDuplicateWarnings(['❌ Range too large! Maximum 300 students at once.']);
      return;
    }

    const padLength = rangeStart.length;
    const lines = [];
    for (let i = start; i <= end; i++) {
      const num = String(i).padStart(padLength, '0');
      lines.push(`Student ${num},${rollPrefix.trim()}${num}`);
    }

    setBulkInput(lines.join('\n'));
    setDuplicateWarnings([]);
    setUploadStatus(`✓ Generated ${lines.length} roll numbers! Edit the names below.`);
    setTimeout(() => setUploadStatus(''), 4000);
  };

  // Validate and preview bulk data BEFORE uploading
  const validateBulkData = () => {
    const lines = bulkInput.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      setDuplicateWarnings(['❌ Please enter student data!']);
      return [];
    }

    const validEntries = [];
    const warnings = [];
    const seenRollNumbers = new Set();
    const existingRolls = new Set(
      Object.entries(students).map(([_, s]) => s.rollNumber)
    );

    lines.forEach((line, index) => {
      const parts = line.split(',').map(p => p.trim());
      
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        warnings.push(`❌ Line ${index + 1}: Invalid format - "${line}"`);
        return;
      }

      const name = parts[0];
      const rollNumber = parts[1];

      // Skip header row
      if (name.toLowerCase().includes('name') && rollNumber.toLowerCase().includes('roll')) {
        return;
      }

      // Check for duplicates in the input itself
      if (seenRollNumbers.has(rollNumber)) {
        warnings.push(`⚠️  Line ${index + 1}: Duplicate in your list - Roll ${rollNumber} appears multiple times`);
        return;
      }

      // Check if roll number already exists in database
      if (existingRolls.has(rollNumber)) {
        warnings.push(`⚠️  Line ${index + 1}: Already in database - Roll ${rollNumber} (${name})`);
        return;
      }

      seenRollNumbers.add(rollNumber);
      validEntries.push({ name, rollNumber, lineNo: index + 1 });
    });

    setDuplicateWarnings(warnings);
    return validEntries;
  };

  // Handle preview/validation
  const handlePreviewData = () => {
    validateBulkData();
  };

  // Bulk upload handler
  const handleBulkUpload = async () => {
    if (!user || !hasProfile) {
      alert("Error: You must complete your CR registration first!");
      router.push('/login');
      return;
    }

    // Validate first
    const validEntries = validateBulkData();
    
    if (validEntries.length === 0) {
      setUploadStatus('✗ No valid entries to upload. Please fix the errors above.');
      return;
    }

    setIsUploading(true);
    setUploadStatus('⏳ Uploading...');
    let successCount = 0;

    try {
      for (const entry of validEntries) {
        const newStudentRef = push(ref(db, `students/${user.uid}`));
        await set(newStudentRef, { 
          name: entry.name, 
          rollNumber: entry.rollNumber 
        });

        setStudents(prev => ({ 
          ...prev, 
          [newStudentRef.key]: { name: entry.name, rollNumber: entry.rollNumber } 
        }));
        setAttendance(prev => ({ 
          ...prev, 
          [newStudentRef.key]: true 
        }));
        successCount++;
      }

      setUploadStatus(`✓ Successfully added ${successCount} student${successCount > 1 ? 's' : ''}!`);
      setBulkInput('');
      setDuplicateWarnings([]);
      
      setTimeout(() => {
        setShowBulkUpload(false);
        setUploadStatus('');
      }, 2500);
    } catch (error) {
      setUploadStatus('✗ Error uploading students. Please try again.');
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  // CSV file handler
  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line);
      setBulkInput(lines.join('\n'));
      setUploadStatus('✓ CSV loaded! Click "Preview Data" to check for duplicates.');
      setTimeout(() => setUploadStatus(''), 3000);
    };
    reader.readAsText(file);
  };

  const handleEditClick = (id, student) => {
    setEditingStudentId(id);
    setStudentName(student.name);
    setStudentRoll(student.rollNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingStudentId(null);
    setStudentName('');
    setStudentRoll('');
  };

  const handleDeleteStudent = async (id) => {
    if (!confirm("Are you sure you want to remove this student from your list?")) return;
    
    await remove(ref(db, `students/${user.uid}/${id}`));
    setStudents(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });

    setAttendance(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    
    if (editingStudentId === id) {
      handleCancelEdit();
    }
  };

  const handleAttendanceChange = (id) => {
    setAttendance(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Check if all students are marked present
  const allStudentsMarked = Object.keys(students).length > 0 && 
    Object.keys(students).every(id => !!attendance[id]);

  // Toggle Mark All / Unmark All
  const handleToggleAllAttendance = () => {
    const targetState = !allStudentsMarked;
    const updatedAtt = {};
    Object.keys(students).forEach(id => {
      updatedAtt[id] = targetState;
    });
    setAttendance(updatedAtt);
  };

  const submitAttendance = async () => {
    if (!user || !hasProfile) {
      alert("Error: You must complete your CR registration first!");
      router.push('/login');
      return;
    }

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

  const downloadSampleCSV = () => {
    const sampleData = "John Doe,0133CI251178\nJane Smith,0133CI251179\nMike Johnson,0133CI251180\nAli Khan,0133CI251181\nSarah Brown,0133CI251182";
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(sampleData));
    element.setAttribute('download', 'sample_students.csv');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const sortedStudentsList = Object.entries(students).sort((a, b) => 
    a[1].rollNumber.localeCompare(b[1].rollNumber, undefined, { numeric: true })
  );

  const presentCount = Object.values(attendance).filter(Boolean).length;
  const totalCount = Object.keys(students).length;

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
            onClick={() => signOut(auth).then(() => { setUser(null); setHasProfile(false); router.push('/login'); })} 
            className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-rose-500 hover:text-white transition-all">
            Logout
          </button>
        </div>
      </div>

      {/* Add / Edit Student Section */}
      <div className={`max-w-4xl mx-auto bg-slate-900 border rounded-2xl shadow-xl p-6 mb-6 transition-all ${editingStudentId ? 'border-amber-500/50 shadow-amber-500/10' : 'border-slate-800'}`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className={`text-lg font-semibold ${editingStudentId ? 'text-amber-400 flex items-center gap-2' : 'text-slate-200'}`}>
            {editingStudentId ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                Editing Student Mode Active
              </>
            ) : (
              "Add Single Student"
            )}
          </h2>
          <div className="flex gap-2">
            {editingStudentId && (
              <button 
                onClick={handleCancelEdit} 
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-all border border-slate-700">
                Cancel Edit
              </button>
            )}
            <button 
              onClick={() => setShowBulkUpload(!showBulkUpload)} 
              className={`text-xs px-4 py-2 rounded-lg transition-all font-medium ${showBulkUpload ? 'bg-purple-700 text-white border border-purple-600' : 'bg-purple-600 hover:bg-purple-500 text-white border border-purple-500'}`}>
              {showBulkUpload ? '✕ Hide Bulk' : '+ Bulk Upload'}
            </button>
          </div>
        </div>
        <form onSubmit={handleAddOrUpdateStudent} className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Student Name" 
            value={studentName} 
            onChange={(e) => setStudentName(e.target.value)} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 flex-1 text-slate-100" 
          />
          <input 
            type="text" 
            placeholder="Roll Number" 
            value={studentRoll} 
            onChange={(e) => setStudentRoll(e.target.value)} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 sm:w-48 text-slate-100" 
          />
          <button type="submit" className={`px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all shadow-lg ${editingStudentId ? 'bg-gradient-to-r from-amber-500 to-orange-600 shadow-orange-900/20 hover:opacity-90' : 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-900/20 hover:opacity-90'}`}>
            {editingStudentId ? "Update" : "Add"}
          </button>
        </form>
      </div>

      {/* Bulk Upload Section */}
      {showBulkUpload && (
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-purple-950/40 to-slate-950 border-2 border-purple-500/50 rounded-2xl shadow-xl p-6 mb-6 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-purple-400 animate-pulse"></div>
            <h2 className="text-lg font-bold text-purple-300">
              📥 Bulk Upload Students
            </h2>
          </div>
          
          {/* Roll Range Generator Section */}
          <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-cyan-400">⚡ Quick Generate Roll Numbers</p>
              <button
                type="button"
                onClick={() => setShowGenerator(!showGenerator)}
                className={`text-xs px-3 py-1 rounded-lg transition-all ${showGenerator ? 'bg-cyan-600 text-white' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'}`}>
                {showGenerator ? '▼ Hide' : '▶ Show'}
              </button>
            </div>

            {showGenerator && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Prefix</label>
                    <input
                      type="text"
                      placeholder="0133CI25"
                      value={rollPrefix}
                      onChange={(e) => setRollPrefix(e.target.value.toUpperCase())}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Start</label>
                    <input
                      type="text"
                      placeholder="1178"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">End</label>
                    <input
                      type="text"
                      placeholder="1250"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={generateRollRange}
                      className="w-full bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white rounded-lg p-2.5 text-sm font-semibold transition-all">
                      🚀 Generate
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  📊 Preview: <span className="text-cyan-400 font-mono">{rollPrefix}{rangeStart}</span> → <span className="text-cyan-400 font-mono">{rollPrefix}{rangeEnd}</span> ({parseInt(rangeEnd) - parseInt(rangeStart) + 1} students)
                </p>
              </div>
            )}
          </div>

          {/* Data Input Section */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-4">
            <p className="text-xs text-slate-300 mb-3 font-semibold">📝 Format: <code className="bg-slate-900 px-2 py-1 rounded text-yellow-400">Name, Roll Number</code></p>
            <p className="text-xs text-slate-400 mb-3">Enter one student per line or generate them above and edit the names</p>
            <textarea 
              value={bulkInput} 
              onChange={(e) => setBulkInput(e.target.value)} 
              placeholder="Student 1178, 0133CI251178&#10;Student 1179, 0133CI251179&#10;Student 1180, 0133CI251180"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 text-slate-100 font-mono resize-none h-40 placeholder-slate-600"
            />
            <p className="text-xs text-slate-400 mt-2">
              📊 {bulkInput.split('\n').filter(line => line.trim()).length} students in list
            </p>
          </div>

          {/* Validation Warnings/Status */}
          {duplicateWarnings.length > 0 && (
            <div className="mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl max-h-48 overflow-y-auto">
              <p className="text-xs font-bold text-slate-300 mb-2">⚠️  Validation Report:</p>
              <div className="space-y-1">
                {duplicateWarnings.map((warning, idx) => (
                  <p key={idx} className={`text-xs ${
                    warning.includes('❌') 
                      ? 'text-rose-400' 
                      : 'text-amber-400'
                  }`}>
                    {warning}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handlePreviewData}
                type="button"
                className="bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-cyan-900/30">
                🔍 Preview Data
              </button>
              <button 
                onClick={handleBulkUpload}
                disabled={isUploading || bulkInput.trim().length === 0}
                type="button"
                className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:from-slate-700 disabled:to-slate-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2">
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    🚀 Upload All
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl font-semibold transition-all cursor-pointer border border-slate-700 text-center text-sm">
                📄 Upload CSV
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".csv,.txt" 
                  onChange={handleCSVUpload}
                  className="hidden"
                />
              </label>
              <button 
                onClick={downloadSampleCSV}
                type="button"
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl font-semibold transition-all border border-slate-700 text-sm">
                📋 Sample CSV
              </button>
            </div>
          </div>

          {/* Status Message */}
          {uploadStatus && (
            <div className={`p-3 rounded-lg text-sm font-semibold border transition-all ${
              uploadStatus.includes('✓') 
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' 
                : uploadStatus.includes('⏳')
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/50'
            }`}>
              {uploadStatus}
            </div>
          )}
        </div>
      )}

      {/* Student List Display */}
      {sortedStudentsList.length > 0 && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-slate-200">📚 Enrolled Students ({sortedStudentsList.length})</h2>
          <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-xs sticky top-0">
                  <th className="p-3">Roll Number</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {sortedStudentsList.map(([id, s]) => (
                  <tr key={id} className={`transition-colors ${editingStudentId === id ? 'bg-amber-500/10 border-l-4 border-amber-500' : 'hover:bg-slate-950/40'}`}>
                    <td className="p-3 font-semibold text-cyan-400">{s.rollNumber}</td>
                    <td className="p-3 text-slate-300">{s.name}</td>
                    <td className="p-3 text-right space-x-2">
                      <button 
                        type="button"
                        onClick={() => handleEditClick(id, s)}
                        className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-lg text-xs font-medium hover:bg-cyan-500 hover:text-slate-950 transition-all cursor-pointer">
                        Edit
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleDeleteStudent(id)}
                        className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-3 py-1 rounded-lg text-xs font-medium hover:bg-rose-500 hover:text-white transition-all cursor-pointer">
                        Delete
                      </button>
                    </td>
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
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-200">✓ Mark Attendance</h2>
              {/* Single Toggle Button for Mark All / Unmark All */}
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
            
            <input 
              type="date" 
              value={markedDate} 
              min={todayStr}
              max={todayStr}
              onChange={(e) => setMarkedDate(e.target.value)} 
              className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm focus:outline-none focus:border-cyan-500 text-slate-200" 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto mb-4 border border-slate-800/80 p-4 rounded-xl bg-slate-950/50">
            {sortedStudentsList.map(([id, s]) => (
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

          <button onClick={submitAttendance} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20">
            💾 Save Attendance
          </button>
        </div>
      )}

      {/* Export Actions */}
      {submittedAttendance && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-xl p-6 text-center mb-6">
          <h3 className="text-lg font-bold text-cyan-400 mb-2">✅ Attendance Recorded Successfully!</h3>
          <p className="text-xs text-slate-400 mb-4">Saved securely and set to expire automatically in 48 hours.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button onClick={downloadJPG} className="bg-indigo-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-900/20">
              📸 Download JPG
            </button>
            <button onClick={copyWhatsAppText} className="bg-emerald-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20">
              💬 Copy WhatsApp Text
            </button>
          </div>
        </div>
      )}

      {/* Hidden Card Template for JPG Export */}
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
            <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>Present Students:</p>
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