// app/students/page.jsx
'use client';
import { useState, useRef, useMemo, useDeferredValue } from 'react';
import { db } from '@/lib/firebase';
import { ref, set, push, update, remove } from 'firebase/database';
import { normalizeRoll } from '@/lib/dateUtils';
import { byRoll } from '@/lib/sort';
import { useCRDashboard, useToast, authLoadingScreen } from '@/lib/useCRDashboard';
import AppShell from '../components/AppShell';

const field =
  'w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-100 placeholder:text-slate-500';

export default function StudentsPage() {
  const { user, loadingAuth, students, setStudents } = useCRDashboard();
  const { toast, showToast } = useToast();

  const [studentName, setStudentName] = useState('');
  const [studentRoll, setStudentRoll] = useState('');
  const [studentSaving, setStudentSaving] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [listSearch, setListSearch] = useState('');
  const deferredListSearch = useDeferredValue(listSearch);

  // Bulk upload
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState([]);
  const fileInputRef = useRef(null);

  // Roll range generator
  const [rollPrefix, setRollPrefix] = useState('0133CI25');
  const [rangeStart, setRangeStart] = useState('1178');
  const [rangeEnd, setRangeEnd] = useState('1250');
  const [showGenerator, setShowGenerator] = useState(false);

  // ---------- Single add / update ----------
  const handleAddOrUpdateStudent = async (e) => {
    e.preventDefault();

    const name = studentName.trim();
    const roll = normalizeRoll(studentRoll);
    if (!name || !roll) {
      showToast('Name and roll number are required.', 'error');
      return;
    }

    const duplicateEntry = Object.entries(students).find(
      ([id, s]) => normalizeRoll(s.rollNumber) === roll && id !== editingStudentId
    );
    if (duplicateEntry) {
      showToast('This roll number is already in your list.', 'error');
      return;
    }

    setStudentSaving(true);
    try {
      if (editingStudentId) {
        await update(ref(db, `students/${user.uid}/${editingStudentId}`), { name, rollNumber: roll });
        setStudents((prev) => ({ ...prev, [editingStudentId]: { name, rollNumber: roll } }));
        setEditingStudentId(null);
        showToast('Student updated.');
      } else {
        const newStudentRef = push(ref(db, `students/${user.uid}`));
        await set(newStudentRef, { name, rollNumber: roll });
        setStudents((prev) => ({ ...prev, [newStudentRef.key]: { name, rollNumber: roll } }));
        showToast('Student added. Available in every semester.');
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
    if (!confirm('Remove this student? Attendance already saved for them stays in the records.')) return;
    try {
      await remove(ref(db, `students/${user.uid}/${id}`));
      setStudents((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      if (editingStudentId === id) handleCancelEdit();
      showToast('Student removed.');
    } catch (error) {
      console.error(error);
      showToast('Could not remove student.', 'error');
    }
  };

  const handleClearAllStudents = async () => {
    if (Object.keys(students).length === 0) return;
    if (!confirm('Remove ALL students? Saved attendance records of every semester are kept. This cannot be undone.')) return;
    try {
      await remove(ref(db, `students/${user.uid}`));
      setStudents({});
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
      setDuplicateWarnings(['❌ Invalid range. Start must be smaller than end.']);
      return;
    }
    if (end - start > 300) {
      setDuplicateWarnings(['❌ Range too large. Maximum 300 students at once.']);
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
    setUploadStatus(`✓ Generated ${lines.length} roll numbers. Edit the names below.`);
    setTimeout(() => setUploadStatus(''), 4000);
  };

  const validateBulkData = () => {
    const lines = bulkInput.trim().split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      setDuplicateWarnings(['❌ Please enter student data.']);
      return [];
    }

    const validEntries = [];
    const warnings = [];
    const seenRollNumbers = new Set();
    const existingRolls = new Set(Object.values(students).map((s) => normalizeRoll(s.rollNumber)));

    lines.forEach((line, index) => {
      const parts = line.split(',').map((p) => p.trim());

      if (parts.length < 2 || !parts[0] || !parts[1]) {
        warnings.push(`❌ Line ${index + 1}: invalid format "${line}"`);
        return;
      }

      const name = parts[0];
      const rollNumber = normalizeRoll(parts[1]);

      if (name.toLowerCase().includes('name') && rollNumber.toLowerCase().includes('roll')) return;

      if (seenRollNumbers.has(rollNumber)) {
        warnings.push(`⚠️ Line ${index + 1}: roll ${rollNumber} appears more than once`);
        return;
      }
      if (existingRolls.has(rollNumber)) {
        warnings.push(`⚠️ Line ${index + 1}: roll ${rollNumber} (${name}) is already in your list`);
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

  const handleBulkUpload = async () => {
    const validEntries = validateBulkData();
    if (validEntries.length === 0) {
      setUploadStatus('✗ Nothing valid to upload. Fix the errors above.');
      return;
    }

    setIsUploading(true);
    setUploadStatus('⏳ Uploading...');

    try {
      const updates = {};
      const added = {};
      validEntries.forEach((entry) => {
        const key = push(ref(db, `students/${user.uid}`)).key;
        const data = { name: entry.name, rollNumber: entry.rollNumber };
        updates[`students/${user.uid}/${key}`] = data;
        added[key] = data;
      });

      await update(ref(db), updates);
      setStudents((prev) => ({ ...prev, ...added }));

      const count = validEntries.length;
      setUploadStatus(`✓ Added ${count} student${count > 1 ? 's' : ''}.`);
      setBulkInput('');
      setDuplicateWarnings([]);

      setTimeout(() => {
        setShowBulkUpload(false);
        setUploadStatus('');
      }, 2500);
    } catch (error) {
      setUploadStatus('✗ Upload failed. Please try again.');
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
      setUploadStatus('✓ File loaded. Tap "Check data" to look for duplicates.');
      setTimeout(() => setUploadStatus(''), 3000);
    };
    reader.readAsText(file);
    e.target.value = '';
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

  // ---------- Derived ----------
  const sortedStudentsList = useMemo(() => Object.entries(students).sort(byRoll), [students]);

  const visibleStudents = useMemo(() => {
    const q = deferredListSearch.trim().toLowerCase();
    if (!q) return sortedStudentsList;
    return sortedStudentsList.filter(
      ([, s]) => s.name.toLowerCase().includes(q) || s.rollNumber.toLowerCase().includes(q)
    );
  }, [sortedStudentsList, deferredListSearch]);

  if (loadingAuth) return authLoadingScreen;
  if (!user) return null;

  const bulkCount = bulkInput.split('\n').filter((line) => line.trim()).length;

  return (
    <AppShell title="My students" subtitle="One list, used in Semester 1 to 8" toast={toast}>
      {/* Add / edit */}
      <section
        className={`bg-slate-900 border rounded-2xl p-4 sm:p-6 transition-colors ${
          editingStudentId ? 'border-amber-500/50' : 'border-slate-800'
        }`}
      >
        <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
          <h2 className={`text-base sm:text-lg font-semibold ${editingStudentId ? 'text-amber-400' : 'text-slate-200'}`}>
            {editingStudentId ? 'Editing student' : 'Add student'}
          </h2>
          <div className="flex gap-2">
            {editingStudentId && (
              <button
                onClick={handleCancelEdit}
                className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-lg border border-slate-700 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => setShowBulkUpload(!showBulkUpload)}
              className="text-sm px-3.5 py-2 rounded-lg font-medium text-white bg-purple-600 hover:bg-purple-500 border border-purple-500 transition-colors"
            >
              {showBulkUpload ? 'Hide bulk upload' : 'Bulk upload'}
            </button>
          </div>
        </div>

        <form onSubmit={handleAddOrUpdateStudent} className="grid grid-cols-1 sm:grid-cols-[1fr_12rem_auto] gap-3">
          <input
            type="text"
            placeholder="Student name"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            required
            maxLength={100}
            className={field}
          />
          <input
            type="text"
            placeholder="Roll number"
            value={studentRoll}
            onChange={(e) => setStudentRoll(e.target.value)}
            required
            maxLength={30}
            className={field}
          />
          <button
            type="submit"
            disabled={studentSaving}
            className={`px-8 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity ${
              editingStudentId
                ? 'bg-gradient-to-r from-amber-500 to-orange-600'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600'
            }`}
          >
            {studentSaving ? 'Saving...' : editingStudentId ? 'Update' : 'Add'}
          </button>
        </form>
      </section>

      {/* Bulk upload */}
      {showBulkUpload && (
        <section className="bg-slate-900 border border-purple-500/40 rounded-2xl p-4 sm:p-6 space-y-4">
          <h2 className="text-base sm:text-lg font-bold text-purple-300">Bulk upload</h2>

          {/* Roll range generator */}
          <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4">
            <button
              type="button"
              onClick={() => setShowGenerator(!showGenerator)}
              className="w-full flex items-center justify-between text-sm font-semibold text-cyan-400"
              aria-expanded={showGenerator}
            >
              Generate roll numbers from a range
              <span>{showGenerator ? '▲' : '▼'}</span>
            </button>

            {showGenerator && (
              <div className="space-y-3 mt-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-xs text-slate-400 block mb-1">Prefix</label>
                    <input
                      type="text"
                      value={rollPrefix}
                      onChange={(e) => setRollPrefix(e.target.value.toUpperCase())}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Start</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">End</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex items-end">
                    <button
                      type="button"
                      onClick={generateRollRange}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors"
                    >
                      Generate
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 break-all">
                  Preview: <span className="text-cyan-400 font-mono">{rollPrefix}{rangeStart}</span> to{' '}
                  <span className="text-cyan-400 font-mono">{rollPrefix}{rangeEnd}</span>
                  {!isNaN(parseInt(rangeStart)) &&
                    !isNaN(parseInt(rangeEnd)) &&
                    parseInt(rangeEnd) >= parseInt(rangeStart) && (
                      <> ({parseInt(rangeEnd) - parseInt(rangeStart) + 1} students)</>
                    )}
                </p>
              </div>
            )}
          </div>

          {/* Data input */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-300 mb-1 font-semibold">
              Format: <code className="bg-slate-900 px-2 py-0.5 rounded text-yellow-400">Name, Roll number</code>
            </p>
            <p className="text-xs text-slate-400 mb-3">One student per line. You can generate rolls above, then edit the names.</p>
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={'Student 1178, 0133CI251178\nStudent 1179, 0133CI251179'}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 text-slate-100 font-mono resize-y h-44 placeholder-slate-600"
            />
            <p className="text-xs text-slate-400 mt-2">{bulkCount} in list</p>
          </div>

          {duplicateWarnings.length > 0 && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto space-y-1">
              <p className="text-xs font-bold text-slate-300 mb-1">Check results</p>
              {duplicateWarnings.map((warning, idx) => (
                <p key={idx} className={`text-xs ${warning.includes('❌') ? 'text-rose-400' : 'text-amber-400'}`}>
                  {warning}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handlePreviewData}
              type="button"
              className="bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              Check data
            </button>
            <button
              onClick={handleBulkUpload}
              disabled={isUploading || bulkInput.trim().length === 0}
              type="button"
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              {isUploading ? 'Uploading...' : 'Upload all'}
            </button>
            <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-xl font-semibold transition-colors cursor-pointer border border-slate-700 text-center text-sm">
              Choose CSV file
              <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleCSVUpload} className="hidden" />
            </label>
            <button
              onClick={downloadSampleCSV}
              type="button"
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-xl font-semibold transition-colors border border-slate-700 text-sm"
            >
              Sample CSV
            </button>
          </div>

          {uploadStatus && (
            <div
              role="status"
              className={`p-3 rounded-lg text-sm font-semibold border ${
                uploadStatus.includes('✓')
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : uploadStatus.includes('⏳')
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/50'
              }`}
            >
              {uploadStatus}
            </div>
          )}
        </section>
      )}

      {/* Roster */}
      {sortedStudentsList.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-base sm:text-lg font-semibold text-slate-200">
              Enrolled students ({sortedStudentsList.length})
            </h2>
            <button
              type="button"
              onClick={handleClearAllStudents}
              className="text-sm bg-rose-500/10 text-rose-400 border border-rose-500/30 px-3.5 py-2 rounded-lg hover:bg-rose-500 hover:text-white transition-colors"
            >
              Remove all
            </button>
          </div>

          <input
            type="search"
            placeholder="Search by name or roll number"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            className={`${field} mb-3`}
          />

          <ul className="divide-y divide-slate-800/70 border border-slate-800 rounded-xl lg:max-h-[30rem] lg:overflow-y-auto">
            {visibleStudents.length === 0 && (
              <li className="p-4 text-sm text-slate-500 text-center">No student matches your search.</li>
            )}
            {visibleStudents.map(([id, s]) => (
              <li
                key={id}
                className={`flex items-center justify-between gap-3 px-3.5 py-3 ${
                  editingStudentId === id ? 'bg-amber-500/10' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{s.name}</p>
                  <p className="text-xs font-mono text-cyan-400">{s.rollNumber}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEditClick(id, s)}
                    className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-cyan-500 hover:text-slate-950 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteStudent(id)}
                    className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-rose-500 hover:text-white transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}