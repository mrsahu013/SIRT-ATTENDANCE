'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, set, get, child, push, update, remove } from 'firebase/database';
import { useRouter } from 'next/navigation';
import html2canvas from 'html2canvas';
import { getLocalDate, shiftDate, normalizeRoll, formatDate, formatDateForFile } from '@/lib/dateUtils';
import { RETENTION_DAYS, MIN_ATTENDANCE_PERCENT } from '@/lib/config';
import { ensureUserId } from '@/lib/userId';

// Build the { studentId: true/false } map for a date from a saved record.
// Students not listed as absent (including newly added ones) default to present.
const buildAttendanceFor = (studentsObj, record) => {
  const result = {};
  const absentRolls = new Set(
    (record?.absent || []).map((a) => normalizeRoll(a.roll))
  );
  Object.entries(studentsObj).forEach(([id, s]) => {
    result[id] = !absentRolls.has(normalizeRoll(s.rollNumber));
  });
  return result;
};

const byRoll = (a, b) =>
  a[1].rollNumber.localeCompare(b[1].rollNumber, undefined, { numeric: true });

export default function Home() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [crData, setCrData] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [students, setStudents] = useState({});
  const [studentName, setStudentName] = useState('');
  const [studentRoll, setStudentRoll] = useState('');
  const [studentSaving, setStudentSaving] = useState(false);

  // Toast (replaces alert)
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  // Announcement from admin
  const [announcement, setAnnouncement] = useState(null);

  // Edit profile (TG name / Year) state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileTg, setProfileTg] = useState('');
  const [profileYear, setProfileYear] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

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

  const todayStr = getLocalDate();
  const oldestStr = shiftDate(todayStr, -(RETENTION_DAYS - 1));
  const MASTER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL;

  // Attendance state
  const [attendance, setAttendance] = useState({});
  const [markedDate, setMarkedDate] = useState(todayStr);
  const [submittedAttendance, setSubmittedAttendance] = useState(null);
  const [history, setHistory] = useState({}); // { 'YYYY-MM-DD': record }
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const exportFullRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setLoadingAuth(false);
        setUser(null);
        setHasProfile(false);
        router.push('/login');
        return;
      }

      setUser(currentUser);
      try {
        const dbRef = ref(db);

        // CR profile
        const crSnap = await get(child(dbRef, `users/${currentUser.uid}`));
        if (!crSnap.exists() || !crSnap.val().tgName) {
          // Signed in but registration not completed -> finish registration
          setHasProfile(false);
          setLoadingAuth(false);
          router.push('/register');
          return;
        }

        setHasProfile(true);
        let profile = crSnap.val();
        // Older accounts get their unique ID on first login after this update
        if (!profile.userId) {
          try {
            const newId = await ensureUserId(currentUser.uid);
            profile = { ...profile, userId: newId };
          } catch (idErr) {
            console.error('Could not allocate user ID', idErr);
          }
        }
        setCrData(profile);
        setLoadingAuth(false);

        // Students + attendance + announcement in parallel
        const [studentsSnap, attSnap, annSnap] = await Promise.all([
          get(child(dbRef, `students/${currentUser.uid}`)),
          get(child(dbRef, `attendance/${currentUser.uid}`)),
          get(child(dbRef, 'announcements/global')).catch(() => null),
        ]);

        const fetchedStudents = studentsSnap.exists() ? studentsSnap.val() : {};
        const hist = attSnap.exists() ? { ...attSnap.val() } : {};

        // Cleanup records older than the retention window (one multi-path write)
        const cutoff = shiftDate(getLocalDate(), -(RETENTION_DAYS - 1));
        const expired = Object.keys(hist).filter((k) => k < cutoff);
        if (expired.length > 0) {
          const updates = {};
          expired.forEach((k) => {
            updates[`attendance/${currentUser.uid}/${k}`] = null;
            delete hist[k];
          });
          update(ref(db), updates).catch((e) => console.error('Cleanup failed', e));
        }

        setStudents(fetchedStudents);
        setHistory(hist);

        // Load today's saved record (if any) so a refresh doesn't lose it
        const todayRecord = hist[getLocalDate()] || null;
        setAttendance(buildAttendanceFor(fetchedStudents, todayRecord));
        setSubmittedAttendance(todayRecord);

        if (annSnap && annSnap.exists()) setAnnouncement(annSnap.val());
      } catch (err) {
        console.error(err);
        setLoadingAuth(false);
        showToast('Could not load your data. Please refresh.', 'error');
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ---------- Profile ----------
  const startEditProfile = () => {
    setProfileTg(crData?.tgName || '');
    setProfileYear(crData?.year || '');
    setEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setEditingProfile(false);
    setProfileTg('');
    setProfileYear('');
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!user || !hasProfile) return;

    const tgName = profileTg.trim();
    const year = profileYear.trim();

    if (!tgName || !year) {
      showToast('TG Name and Year cannot be empty!', 'error');
      return;
    }

    setProfileSaving(true);
    try {
      await update(ref(db, `users/${user.uid}`), { tgName, year });
      setCrData((prev) => ({ ...prev, tgName, year }));
      setEditingProfile(false);
      showToast('Profile updated successfully!');
    } catch (error) {
      console.error(error);
      showToast('Error updating profile. Please try again.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  // ---------- Students ----------
  const handleAddOrUpdateStudent = async (e) => {
    e.preventDefault();
    if (!user || !hasProfile) {
      showToast('You must complete your CR registration first!', 'error');
      router.push('/register');
      return;
    }

    const name = studentName.trim();
    const roll = normalizeRoll(studentRoll);
    if (!name || !roll) {
      showToast('Name and Roll Number are required.', 'error');
      return;
    }

    const duplicateEntry = Object.entries(students).find(
      ([id, s]) => normalizeRoll(s.rollNumber) === roll && id !== editingStudentId
    );
    if (duplicateEntry) {
      showToast('This Roll Number already exists in your list!', 'error');
      return;
    }

    setStudentSaving(true);
    try {
      if (editingStudentId) {
        await update(ref(db, `students/${user.uid}/${editingStudentId}`), {
          name,
          rollNumber: roll,
        });
        setStudents((prev) => ({
          ...prev,
          [editingStudentId]: { name, rollNumber: roll },
        }));
        setEditingStudentId(null);
        showToast('Student updated.');
      } else {
        const newStudentRef = push(ref(db, `students/${user.uid}`));
        await set(newStudentRef, { name, rollNumber: roll });
        setStudents((prev) => ({
          ...prev,
          [newStudentRef.key]: { name, rollNumber: roll },
        }));
        setAttendance((prev) => ({ ...prev, [newStudentRef.key]: true }));
        showToast('Student added.');
      }
      setStudentName('');
      setStudentRoll('');
    } catch (error) {
      console.error(error);
      showToast('Could not save student. Please try again.', 'error');
    } finally {
      setStudentSaving(false);
    }
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
    if (!confirm('Are you sure you want to remove this student from your list?')) return;
    try {
      await remove(ref(db, `students/${user.uid}/${id}`));
      setStudents((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      setAttendance((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      if (editingStudentId === id) handleCancelEdit();
      showToast('Student removed.');
    } catch (error) {
      console.error(error);
      showToast('Could not delete student.', 'error');
    }
  };

  // Clear the whole class (new semester)
  const handleClearAllStudents = async () => {
    if (Object.keys(students).length === 0) return;
    if (
      !confirm(
        'Remove ALL students from your list? Saved attendance records are kept. This cannot be undone.'
      )
    )
      return;
    try {
      await remove(ref(db, `students/${user.uid}`));
      setStudents({});
      setAttendance({});
      handleCancelEdit();
      showToast('All students removed.');
    } catch (error) {
      console.error(error);
      showToast('Could not clear students.', 'error');
    }
  };

  // ---------- Bulk upload ----------
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

  const validateBulkData = () => {
    const lines = bulkInput.trim().split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      setDuplicateWarnings(['❌ Please enter student data!']);
      return [];
    }

    const validEntries = [];
    const warnings = [];
    const seenRollNumbers = new Set();
    const existingRolls = new Set(
      Object.values(students).map((s) => normalizeRoll(s.rollNumber))
    );

    lines.forEach((line, index) => {
      const parts = line.split(',').map((p) => p.trim());

      if (parts.length < 2 || !parts[0] || !parts[1]) {
        warnings.push(`❌ Line ${index + 1}: Invalid format - "${line}"`);
        return;
      }

      const name = parts[0];
      const rollNumber = normalizeRoll(parts[1]);

      // Skip header row
      if (name.toLowerCase().includes('name') && rollNumber.toLowerCase().includes('roll')) {
        return;
      }

      if (seenRollNumbers.has(rollNumber)) {
        warnings.push(`⚠️ Line ${index + 1}: Duplicate in your list - Roll ${rollNumber} appears multiple times`);
        return;
      }

      if (existingRolls.has(rollNumber)) {
        warnings.push(`⚠️ Line ${index + 1}: Already in database - Roll ${rollNumber} (${name})`);
        return;
      }

      seenRollNumbers.add(rollNumber);
      validEntries.push({ name, rollNumber, lineNo: index + 1 });
    });

    setDuplicateWarnings(warnings);
    return validEntries;
  };

  const handlePreviewData = () => {
    const valid = validateBulkData();
    if (valid.length > 0) {
      setUploadStatus(`✓ ${valid.length} valid student${valid.length > 1 ? 's' : ''} ready to upload.`);
      setTimeout(() => setUploadStatus(''), 3000);
    }
  };

  // Single multi-path write instead of one request per student
  const handleBulkUpload = async () => {
    if (!user || !hasProfile) {
      showToast('You must complete your CR registration first!', 'error');
      router.push('/register');
      return;
    }

    const validEntries = validateBulkData();
    if (validEntries.length === 0) {
      setUploadStatus('✗ No valid entries to upload. Please fix the errors above.');
      return;
    }

    setIsUploading(true);
    setUploadStatus('⏳ Uploading...');

    try {
      const updates = {};
      const added = {};
      const addedAtt = {};
      validEntries.forEach((entry) => {
        const key = push(ref(db, `students/${user.uid}`)).key; // key only, no write
        const data = { name: entry.name, rollNumber: entry.rollNumber };
        updates[`students/${user.uid}/${key}`] = data;
        added[key] = data;
        addedAtt[key] = true;
      });

      await update(ref(db), updates);

      setStudents((prev) => ({ ...prev, ...added }));
      setAttendance((prev) => ({ ...prev, ...addedAtt }));

      const count = validEntries.length;
      setUploadStatus(`✓ Successfully added ${count} student${count > 1 ? 's' : ''}!`);
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

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '').replace(/^\uFEFF/, '');
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line);
      setBulkInput(lines.join('\n'));
      setUploadStatus('✓ CSV loaded! Click "Preview Data" to check for duplicates.');
      setTimeout(() => setUploadStatus(''), 3000);
    };
    reader.readAsText(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  const downloadSampleCSV = () => {
    const sampleData =
      'John Doe,0133CI251178\nJane Smith,0133CI251179\nMike Johnson,0133CI251180\nAli Khan,0133CI251181\nSarah Brown,0133CI251182';
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(sampleData));
    element.setAttribute('download', 'sample_students.csv');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

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

  // Switch date: load the saved record for that day (or reset to all present)
  const handleDateChange = (dateStr) => {
    if (!dateStr) return;
    if (dateStr > todayStr || dateStr < oldestStr) return;
    setMarkedDate(dateStr);
    const rec = history[dateStr] || null;
    setAttendance(buildAttendanceFor(students, rec));
    setSubmittedAttendance(rec);
    setStudentSearch('');
  };

  const submitAttendance = async () => {
    if (!user || !hasProfile) {
      showToast('You must complete your CR registration first!', 'error');
      router.push('/register');
      return;
    }
    if (Object.keys(students).length === 0) return;

    const existing = history[markedDate];
    if (
      existing &&
      !confirm(`Attendance for ${formatDate(markedDate)} is already saved. Overwrite it?`)
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
      timestamp: Date.now(),
      present: presentList,
      absent: absentList,
    };

    setSavingAttendance(true);
    try {
      await set(ref(db, `attendance/${user.uid}/${markedDate}`), attendanceRecord);
      setHistory((prev) => ({ ...prev, [markedDate]: attendanceRecord }));
      setSubmittedAttendance(attendanceRecord);
      showToast(
        `Saved ${formatDate(markedDate)}: ${presentList.length} present, ${absentList.length} absent.`
      );
    } catch (error) {
      console.error(error);
      showToast('Could not save attendance. Check your connection and try again.', 'error');
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleDeleteRecord = async (dateKey) => {
    if (!confirm(`Delete the saved attendance for ${formatDate(dateKey)}?`)) return;
    try {
      await remove(ref(db, `attendance/${user.uid}/${dateKey}`));
      setHistory((prev) => {
        const updated = { ...prev };
        delete updated[dateKey];
        return updated;
      });
      if (markedDate === dateKey) {
        setSubmittedAttendance(null);
        setAttendance(buildAttendanceFor(students, null));
      }
      showToast('Record deleted.');
    } catch (error) {
      console.error(error);
      showToast('Could not delete record.', 'error');
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
      link.download = `Attendance_Full_${crRoll}_${formatDateForFile(submittedAttendance.date)}.jpg`;
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

    return (
      `📋 *ATTENDANCE REPORT* 📋\n` +
      `🏫 *College:* ${crData?.collegeName}\n` +
      `📚 *Class:* ${crData?.branch} - Sec ${crData?.section} (${crData?.year})\n` +
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

  // ---------- Derived data ----------
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

  // Per-student percentage across the saved records
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

  const historyList = useMemo(
    () =>
      Object.entries(history)
        .map(([dateKey, rec]) => ({ dateKey, rec }))
        .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1)),
    [history]
  );

  const presentCount = Object.keys(students).filter((id) => attendance[id]).length;
  const totalCount = Object.keys(students).length;
  const isEditingExisting = !!history[markedDate];

  const dismissedKey = 'dismissedAnnouncement';
  const [dismissedTs, setDismissedTs] = useState(0);
  useEffect(() => {
    try {
      setDismissedTs(Number(localStorage.getItem(dismissedKey)) || 0);
    } catch {}
  }, []);
  const dismissAnnouncement = () => {
    try {
      localStorage.setItem(dismissedKey, String(announcement.timestamp));
    } catch {}
    setDismissedTs(announcement.timestamp);
  };

  // ---------- Render ----------
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

  const showAnnouncement =
    announcement?.message && announcement.timestamp > dismissedTs;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl border ${
            toast.type === 'error'
              ? 'bg-rose-950 text-rose-200 border-rose-500/50'
              : 'bg-emerald-950 text-emerald-200 border-emerald-500/50'
          }`}>
          {toast.message}
        </div>
      )}

      {/* Admin announcement */}
      {showAnnouncement && (
        <div className="max-w-4xl mx-auto bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">📢 Announcement</p>
            <p className="text-sm text-amber-100 whitespace-pre-wrap">{announcement.message}</p>
          </div>
          <button
            onClick={dismissAnnouncement}
            className="text-amber-300 hover:text-white text-sm px-2"
            aria-label="Dismiss announcement">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            CR Portal Dashboard
          </h1>
          {crData && (
            <p className="text-slate-400 text-sm mt-1">
              <span className="text-slate-200 font-medium">{crData.crName}</span>{crData.userId && <> <span className="font-mono text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full">ID: {crData.userId}</span></>} (Roll: {crData.crRollNumber}) | {crData.collegeName} | {crData.branch} Sec {crData.section} | Year: {crData.year} | TG: {crData.tgName}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={editingProfile ? cancelEditProfile : startEditProfile}
            className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-500 hover:text-slate-950 transition-all">
            {editingProfile ? '✕ Close' : '✏️ Edit'}
          </button>
          {user?.email && MASTER_ADMIN_EMAIL && user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() && (
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

      {/* Edit Profile (TG Name / Year) */}
      {editingProfile && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-amber-500/50 shadow-amber-500/10 rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
            Edit
          </h2>
          <form onSubmit={saveProfile} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">TG Name</label>
              <input
                type="text"
                placeholder="TG Name"
                value={profileTg}
                onChange={(e) => setProfileTg(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-500 text-slate-100"
              />
            </div>
            <div className="sm:w-48">
              <label className="text-xs text-slate-400 block mb-1">Year</label>
              <input
                type="text"
                placeholder="Year"
                value={profileYear}
                onChange={(e) => setProfileYear(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-500 text-slate-100"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={profileSaving}
                className="px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-orange-900/20">
                {profileSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={cancelEditProfile}
                className="px-4 py-3 rounded-xl text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

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
              'Add Single Student'
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
            maxLength={100}
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 flex-1 text-slate-100"
          />
          <input
            type="text"
            placeholder="Roll Number"
            value={studentRoll}
            onChange={(e) => setStudentRoll(e.target.value)}
            required
            maxLength={30}
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 sm:w-48 text-slate-100"
          />
          <button
            type="submit"
            disabled={studentSaving}
            className={`px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all shadow-lg disabled:opacity-50 ${editingStudentId ? 'bg-gradient-to-r from-amber-500 to-orange-600 shadow-orange-900/20 hover:opacity-90' : 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-900/20 hover:opacity-90'}`}>
            {studentSaving ? 'Saving...' : editingStudentId ? 'Update' : 'Add'}
          </button>
        </form>
      </div>

      {/* Bulk Upload Section */}
      {showBulkUpload && (
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-purple-950/40 to-slate-950 border-2 border-purple-500/50 rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-purple-400 animate-pulse"></div>
            <h2 className="text-lg font-bold text-purple-300">📥 Bulk Upload Students</h2>
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
                  📊 Preview: <span className="text-cyan-400 font-mono">{rollPrefix}{rangeStart}</span> → <span className="text-cyan-400 font-mono">{rollPrefix}{rangeEnd}</span>
                  {!isNaN(parseInt(rangeStart)) && !isNaN(parseInt(rangeEnd)) && parseInt(rangeEnd) >= parseInt(rangeStart) && (
                    <> ({parseInt(rangeEnd) - parseInt(rangeStart) + 1} students)</>
                  )}
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
              📊 {bulkInput.split('\n').filter((line) => line.trim()).length} students in list
            </p>
          </div>

          {/* Validation Warnings/Status */}
          {duplicateWarnings.length > 0 && (
            <div className="mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl max-h-48 overflow-y-auto">
              <p className="text-xs font-bold text-slate-300 mb-2">⚠️ Validation Report:</p>
              <div className="space-y-1">
                {duplicateWarnings.map((warning, idx) => (
                  <p key={idx} className={`text-xs ${warning.includes('❌') ? 'text-rose-400' : 'text-amber-400'}`}>
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
                  <>🚀 Upload All</>
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
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-slate-200">📚 Enrolled Students ({sortedStudentsList.length})</h2>
            <button
              type="button"
              onClick={handleClearAllStudents}
              className="text-xs bg-rose-500/10 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-lg hover:bg-rose-500 hover:text-white transition-all">
              🗑 Clear All
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Attendance % is calculated from the last {RETENTION_DAYS} days of saved records. Below {MIN_ATTENDANCE_PERCENT}% is flagged in red.
          </p>
          <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-xs sticky top-0">
                  <th className="p-3">Roll Number</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Attendance</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {sortedStudentsList.map(([id, s]) => {
                  const st = stats[normalizeRoll(s.rollNumber)];
                  const pct = st && st.total > 0 ? Math.round((st.present / st.total) * 100) : null;
                  return (
                    <tr key={id} className={`transition-colors ${editingStudentId === id ? 'bg-amber-500/10 border-l-4 border-amber-500' : 'hover:bg-slate-950/40'}`}>
                      <td className="p-3 font-semibold text-cyan-400">{s.rollNumber}</td>
                      <td className="p-3 text-slate-300">{s.name}</td>
                      <td className="p-3 text-xs">
                        {pct === null ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span className={`font-semibold ${pct < MIN_ATTENDANCE_PERCENT ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {pct}% <span className="text-slate-500 font-normal">({st.present}/{st.total})</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-2 whitespace-nowrap">
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
                  );
                })}
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
              ✏️ Attendance for {formatDate(markedDate)} is already saved. Saving again will overwrite it.
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
      )}

      {/* History */}
      {historyList.length > 0 && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-1">🗓 Saved Records</h2>
          <p className="text-xs text-slate-500 mb-4">
            Records are kept for {RETENTION_DAYS} days. Tap a date to view or edit it.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {historyList.map(({ dateKey, rec }) => {
              const p = (rec.present || []).length;
              const a = (rec.absent || []).length;
              const active = dateKey === markedDate;
              return (
                <div
                  key={dateKey}
                  className={`flex items-center justify-between gap-2 border rounded-xl px-3 py-2 text-sm ${active ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/50'}`}>
                  <button
                    type="button"
                    onClick={() => handleDateChange(dateKey)}
                    className="flex-1 text-left flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-semibold text-slate-200">{formatDate(dateKey)}</span>
                    <span className="text-emerald-400 text-xs">Present: {p}</span>
                    <span className="text-rose-400 text-xs">Absent: {a}</span>
                  </button>
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

      {/* Export Actions + Present/Absent Result */}
      {submittedAttendance && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-xl p-6 mb-6">
          <div className="text-center mb-5">
            <h3 className="text-lg font-bold text-cyan-400 mb-1">✅ Attendance Recorded</h3>
            <p className="text-xs text-slate-400">
              {formatDate(submittedAttendance.date)} • Kept for {RETENTION_DAYS} days.
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

      {/* Hidden Card Template for JPG Export: Present (green) + Absent (red) */}
      <div style={{ position: 'absolute', left: '-9999px' }}>
        <div ref={exportFullRef} style={{ width: '700px', padding: '30px', background: '#ffffff', color: '#000000', fontFamily: 'Arial, sans-serif' }}>
          <h2 style={{ textAlign: 'center', color: '#1e3a8a', margin: '0 0 10px 0' }}>{crData?.collegeName}</h2>
          <p style={{ textAlign: 'center', fontSize: '14px', color: '#4b5563', margin: '0 0 20px 0' }}>
            Branch: {crData?.branch} | Sec: {crData?.section} | Year: {crData?.year} | TG: {crData?.tgName}
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
    </div>
  );
}