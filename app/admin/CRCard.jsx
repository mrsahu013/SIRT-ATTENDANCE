// app/admin/CRCard.jsx
'use client';
import { useState, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { ref, update, push, set, remove } from 'firebase/database';
import { MAX_SEMESTER } from '@/lib/config';
import { normalizeRoll } from '@/lib/dateUtils';
import { byRoll } from '@/lib/sort';

const semesterOptions = Array.from({ length: MAX_SEMESTER }, (_, i) => i + 1);

const PROFILE_FIELDS = [
  { key: 'crName', label: 'CR name' },
  { key: 'crRollNumber', label: 'CR roll number' },
  { key: 'collegeName', label: 'College' },
  { key: 'branch', label: 'Branch' },
  { key: 'section', label: 'Section' },
  { key: 'tgName', label: 'TG name' },
];

const inputCls =
  'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500';

const smallBtn =
  'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50';

export default function CRCard({ uid, cr, studentList, showToast, onChanged }) {
  // ----- Profile editing -----
  const [editingProfile, setEditingProfile] = useState(false);
  const [form, setForm] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  // ----- Student editing -----
  const [showStudents, setShowStudents] = useState(false);
  const [editingSid, setEditingSid] = useState(null);
  const [sName, setSName] = useState('');
  const [sRoll, setSRoll] = useState('');
  const [savingStudent, setSavingStudent] = useState(false);

  const sorted = useMemo(() => [...studentList].sort(byRoll), [studentList]);

  const startEditProfile = () => {
    const f = {};
    PROFILE_FIELDS.forEach(({ key }) => (f[key] = cr[key] || ''));
    f.semester = Number(cr.semester) || 1;
    setForm(f);
    setEditingProfile(true);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    const fields = {};
    for (const { key, label } of PROFILE_FIELDS) {
      const v = String(form[key] || '').trim();
      if (!v) {
        showToast(`${label} cannot be empty.`, 'error');
        return;
      }
      fields[key] = v;
    }
    const sem = Number(form.semester);
    if (!(sem >= 1 && sem <= MAX_SEMESTER)) {
      showToast('Semester must be between 1 and ' + MAX_SEMESTER + '.', 'error');
      return;
    }
    fields.semester = sem;

    setSavingProfile(true);
    try {
      await update(ref(db, `users/${uid}`), fields);
      showToast('CR details updated.');
      setEditingProfile(false);
      await onChanged();
    } catch (err) {
      console.error(err);
      showToast('Could not update: ' + err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const sendReset = async () => {
    if (!cr.email) return showToast('This CR has no email saved.', 'error');
    if (!confirm(`Send a password reset email to ${cr.email}?`)) return;
    try {
      await sendPasswordResetEmail(auth, cr.email);
      showToast(`Reset email sent to ${cr.email}.`);
    } catch (err) {
      showToast('Could not send reset email: ' + err.message, 'error');
    }
  };

  // ----- Students -----
  const resetStudentForm = () => {
    setEditingSid(null);
    setSName('');
    setSRoll('');
  };

  const startEditStudent = (sid, s) => {
    setShowStudents(true);
    setEditingSid(sid);
    setSName(s.name || '');
    setSRoll(s.rollNumber || '');
  };

  const saveStudent = async (e) => {
    e.preventDefault();
    const name = sName.trim();
    const roll = normalizeRoll(sRoll);
    if (!name || !roll) return showToast('Name and roll number are required.', 'error');

    const dup = studentList.find(
      ([sid, s]) => normalizeRoll(s.rollNumber) === roll && sid !== editingSid,
    );
    if (dup) return showToast('This roll number already exists for this CR.', 'error');

    setSavingStudent(true);
    try {
      if (editingSid) {
        await update(ref(db, `students/${uid}/${editingSid}`), { name, rollNumber: roll });
        showToast('Student updated.');
      } else {
        const newRef = push(ref(db, `students/${uid}`));
        await set(newRef, { name, rollNumber: roll });
        showToast('Student added.');
      }
      resetStudentForm();
      await onChanged();
    } catch (err) {
      console.error(err);
      showToast('Could not save student: ' + err.message, 'error');
    } finally {
      setSavingStudent(false);
    }
  };

  const deleteStudent = async (sid, s) => {
    if (!confirm(`Remove ${s.name} (${s.rollNumber})? Saved attendance records are not changed.`)) return;
    try {
      await remove(ref(db, `students/${uid}/${sid}`));
      if (editingSid === sid) resetStudentForm();
      showToast('Student removed.');
      await onChanged();
    } catch (err) {
      showToast('Could not remove student: ' + err.message, 'error');
    }
  };

  const clearStudents = async () => {
    if (studentList.length === 0) return;
    if (!confirm(`Remove ALL ${studentList.length} students of this CR? This cannot be undone.`)) return;
    try {
      await remove(ref(db, `students/${uid}`));
      resetStudentForm();
      showToast('All students removed.');
      await onChanged();
    } catch (err) {
      showToast('Could not clear students: ' + err.message, 'error');
    }
  };

  const deleteCR = async () => {
    if (
      !confirm(
        "Delete this CR's profile, students and attendance records? (Their login account stays in Firebase Authentication.)",
      )
    )
      return;
    try {
      const updates = {
        [`users/${uid}`]: null,
        [`students/${uid}`]: null,
        [`attendance/${uid}`]: null,
      };
      if (cr.userId) updates[`userIds/${cr.userId}`] = null;
      await update(ref(db), updates);
      showToast('CR data removed successfully.');
      await onChanged();
    } catch (err) {
      showToast('Error deleting CR: ' + err.message, 'error');
    }
  };

  return (
    <div className="border border-slate-800 bg-slate-950/50 rounded-2xl p-5 shadow-md">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 pb-4 border-b border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-100 text-base">{cr.crName}</h3>
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
          <p className="text-xs text-slate-400 mt-1 break-words">
            {cr.collegeName} • {cr.branch} (Sec {cr.section}) • TG: {cr.tgName} •{' '}
            <span className="text-slate-500">{cr.email}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={editingProfile ? () => setEditingProfile(false) : startEditProfile}
            className={`${smallBtn} bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500 hover:text-slate-950`}
          >
            {editingProfile ? 'Cancel edit' : 'Edit details'}
          </button>
          <button
            type="button"
            onClick={sendReset}
            className={`${smallBtn} bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700`}
          >
            Send password reset
          </button>
          <button
            type="button"
            onClick={deleteCR}
            className={`${smallBtn} bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500 hover:text-white`}
          >
            Delete CR & Data
          </button>
        </div>
      </div>

      {/* Profile edit form */}
      {editingProfile && (
        <form
          onSubmit={saveProfile}
          className="mt-4 p-4 bg-slate-900 border border-amber-500/40 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {PROFILE_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">{label}</label>
              <input
                type="text"
                value={form[key] ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                required
                className={inputCls}
              />
            </div>
          ))}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Default semester</label>
            <select
              value={form.semester ?? 1}
              onChange={(e) => setForm((p) => ({ ...p, semester: Number(e.target.value) }))}
              className={inputCls}
            >
              {semesterOptions.map((n) => (
                <option key={n} value={n}>
                  Semester {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Email and user ID (cannot be edited)
            </label>
            <p className="text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 break-all">
              {cr.email || 'no email'} • {cr.userId || 'no ID yet'}
            </p>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingProfile(false)}
              className={`${smallBtn} bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 disabled:opacity-50"
            >
              {savingProfile ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      {/* Students */}
      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Enrolled Students ({sorted.length})
          </h4>
          <button
            type="button"
            onClick={() => setShowStudents((v) => !v)}
            className={`${smallBtn} bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500 hover:text-slate-950`}
          >
            {showStudents ? 'Hide editor' : 'Edit students'}
          </button>
        </div>

        {showStudents && (
          <div className="mb-4 p-4 bg-slate-900 border border-cyan-500/30 rounded-xl space-y-3">
            <form onSubmit={saveStudent} className="grid grid-cols-1 sm:grid-cols-[1fr_11rem_auto_auto] gap-2.5">
              <input
                type="text"
                placeholder="Student name"
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                maxLength={100}
                required
                className={inputCls}
              />
              <input
                type="text"
                placeholder="Roll number"
                value={sRoll}
                onChange={(e) => setSRoll(e.target.value)}
                maxLength={30}
                required
                className={inputCls}
              />
              <button
                type="submit"
                disabled={savingStudent}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 disabled:opacity-50"
              >
                {savingStudent ? 'Saving...' : editingSid ? 'Update' : 'Add'}
              </button>
              {editingSid && (
                <button
                  type="button"
                  onClick={resetStudentForm}
                  className={`${smallBtn} bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700`}
                >
                  Cancel
                </button>
              )}
            </form>
            <p className="text-[11px] text-slate-500">
              Changing a roll number does not change old attendance records. They keep the roll
              that was saved that day.
            </p>
            {sorted.length > 0 && (
              <button
                type="button"
                onClick={clearStudents}
                className={`${smallBtn} bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500 hover:text-white`}
              >
                Remove all students
              </button>
            )}
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="text-xs text-slate-500 italic bg-slate-900/50 p-3 rounded-xl border border-slate-800/60">
            No students added under this CR yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
            {sorted.map(([sid, s]) => (
              <div
                key={sid}
                className={`bg-slate-900 border p-2.5 rounded-xl text-xs flex items-start justify-between gap-2 ${
                  editingSid === sid ? 'border-amber-500/60' : 'border-slate-800'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-200 truncate">{s.name}</p>
                  <p className="text-slate-400 text-[10px] font-mono">{s.rollNumber}</p>
                </div>
                {showStudents && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditStudent(sid, s)}
                      className="text-[11px] font-semibold text-cyan-400 border border-cyan-500/30 px-2 py-1 rounded-lg hover:bg-cyan-500 hover:text-slate-950"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteStudent(sid, s)}
                      className="text-[11px] font-semibold text-rose-400 border border-rose-500/30 px-2 py-1 rounded-lg hover:bg-rose-500 hover:text-white"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}