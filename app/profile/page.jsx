// app/profile/page.jsx
'use client';
import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { MAX_SEMESTER } from '@/lib/config';
import { useCRDashboard, useToast, authLoadingScreen } from '@/lib/useCRDashboard';
import HeaderNav from '../components/HeaderNav';
import Toast from '../components/Toast';

const semesterOptions = Array.from({ length: MAX_SEMESTER }, (_, i) => i + 1);

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center gap-4 py-2 border-b border-slate-800/60 last:border-b-0">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-slate-200 text-right">{value ?? '—'}</span>
    </div>
  );
}

export default function ProfilePage() {
  const {
    user,
    loadingAuth,
    crData,
    semester,
    selectSemester,
    updateProfile,
  } = useCRDashboard();
  const { toast, showToast } = useToast();

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileTg, setProfileTg] = useState('');
  const [profileSem, setProfileSem] = useState(1);
  const [profileSaving, setProfileSaving] = useState(false);

  const startEditProfile = () => {
    setProfileTg(crData?.tgName || '');
    setProfileSem(crData?.semester || semester);
    setEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setEditingProfile(false);
    setProfileTg('');
  };

  const saveProfile = async (e) => {
    e.preventDefault();

    const tgName = profileTg.trim();
    const sem = Number(profileSem);

    if (!tgName) {
      showToast('TG Name cannot be empty!', 'error');
      return;
    }

    setProfileSaving(true);
    try {
      await updateProfile({ tgName, semester: sem });
      selectSemester(sem); // apply immediately + remember
      setEditingProfile(false);
      showToast(`Profile updated. Default semester set to ${sem}.`);
    } catch (error) {
      console.error(error);
      showToast('Error updating profile. Please try again.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  if (loadingAuth) return authLoadingScreen;
  if (!user) return null; // redirecting to /login

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <Toast toast={toast} />

      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
          Profile
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          View your details, update TG Name and set your default semester.
        </p>
      </div>

      <HeaderNav active="/profile" />

      {editingProfile ? (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-amber-500/50 shadow-amber-500/10 rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
            Edit Profile
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
            <div className="sm:w-44">
              <label className="text-xs text-slate-400 block mb-1">Default Semester</label>
              <select
                value={profileSem}
                onChange={(e) => setProfileSem(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-500 text-slate-100">
                {semesterOptions.map((n) => (
                  <option key={n} value={n}>Semester {n}</option>
                ))}
              </select>
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
      ) : (
        <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-200">My Details</h2>
            <button
              onClick={startEditProfile}
              className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-500 hover:text-slate-950 transition-all">
              ✏️ Edit
            </button>
          </div>
          <div>
            <Row label="CR Name" value={crData?.crName} />
            <Row
              label="CR User ID"
              value={
                crData?.userId ? (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(crData.userId);
                      showToast(`Copied ${crData.userId}`);
                    }}
                    title="Click to copy"
                    className="font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-lg hover:bg-indigo-500 hover:text-white transition-all">
                    {crData.userId}
                  </button>
                ) : (
                  <span className="text-slate-500 italic text-xs">ID pending (assigned on next login)</span>
                )
              }
            />
            <Row label="Roll Number" value={crData?.crRollNumber} />
            <Row label="College" value={crData?.collegeName} />
            <Row label="Branch" value={crData?.branch} />
            <Row label="Section" value={crData?.section} />
            <Row
              label="Default Semester"
              value={crData?.semester ? `Semester ${crData.semester}` : 'Semester 1'}
            />
            <Row label="TG Name" value={crData?.tgName} />
            <Row label="Email" value={crData?.email || user?.email} />
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => signOut(auth).then(() => window.location.reload())}
          className="w-full bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-rose-500 hover:text-white transition-all">
          Logout
        </button>
      </div>
    </div>
  );
}