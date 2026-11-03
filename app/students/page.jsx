// app/students/page.jsx
'use client';
import { useState, useRef, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { ref, set, get, push, update, remove } from 'firebase/database';
import { normalizeRoll } from '@/lib/dateUtils';
import { useCRDashboard, useToast, authLoadingScreen } from '@/lib/useCRDashboard';
import HeaderNav from '../components/HeaderNav';
import Toast from '../components/Toast';


const byRoll = (a, b) =>
  a[1].rollNumber.localeCompare(b[1].rollNumber, undefined, { numeric: true });

export default function StudentsPage() {
  const { user, loadingAuth, students, setStudents } = useCRDashboard();
  const { toast, showToast } = useToast();

  const [studentName, setStudentName] = useState('');
  const [studentRoll, setStudentRoll] = useState('');
  const [studentSaving, setStudentSaving] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);

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
        showToast('Student added. Usable in every semester.');
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
    if (!confirm('Remove this student from your list? Semester attendance already saved for them stays in the records.')) return;
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
      showToast('Could not delete student.', 'error');
    }
  };

  const handleClearAllStudents = async () => {
    if (Object.keys(students).length === 0) return;
    if (!confirm('Remove ALL students from your list? Saved attendance records of every semester are kept. This cannot be undone.')) return;
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

      if (name.toLowerCase().includes('name') && rollNumber.toLowerCase().includes('roll')) {
        return; // header row
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

  const handleBulkUpload = async () => {
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
      validEntries.forEach((entry) => {
        const key = push(ref(db, `students/${user.uid}`)).key;
        const data = { name: entry.name, rollNumber: entry.rollNumber };
        updates[`students/${user.uid}/${key}`] = data;
        added[key] = data;
      });

      await update(ref(db), updates);
      setStudents((prev) => ({ ...prev, ...added }));

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
  const sortedStudentsList = useMemo(
    () => Object.entries(students).sort(byRoll),
    [students]
  );

  if (loadingAuth) return authLoadingScreen;
  if (!user) return null; // redirecting to /login

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <Toast toast={toast} />

      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            My Students
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            One shared list — usable for attendance marking in Semester 1 to 8.
          </p>
        </div>
      </div>

      <HeaderNav active="/students" />

      {/* Add / Edit Student */}
      <div className={`max-w-4xl mx-auto bg-slate-900 border rounded-2xl shadow-xl p-6 mb-6 transition-all ${editingStudentId ? 'border-amber-500/50 shadow-amber-500/10' : 'border-slate-800'}`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className={`text-lg font-semibold ${editingStudentId ? 'text-amber-400 flex items-center gap-2' : 'text-slate-200'}`}>
            {editingStudentId ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                Editing Student Mode Active
              </>
            ) : (
              'Add Student'
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

      {/* Bulk Upload */}
      {showBulkUpload && (
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-purple-950/40 to-slate-950 border-2 border-purple-500/50 rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-purple-400 animate-pulse"></div>
            <h2 className="text-lg font-bold text-purple-300">📥 Bulk Upload Students</h2>
          </div>

          {/* Roll Range Generator */}
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

          {/* Data Input */}
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

          {/* Validation Warnings */}
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

      {/* Roster List */}
      {sortedStudentsList.length > 0 && (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-slate-200">
              📚 Enrolled Students ({sortedStudentsList.length})
            </h2>
            <button
              type="button"
              onClick={handleClearAllStudents}
              className="text-xs bg-rose-500/10 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-lg hover:bg-rose-500 hover:text-white transition-all">
              🗑 Clear All
            </button>
          </div>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}