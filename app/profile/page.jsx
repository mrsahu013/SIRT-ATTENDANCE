// app/profile/page.jsx
'use client';
import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { MAX_SEMESTER } from '@/lib/config';
import { useCRDashboard, useToast, authLoadingScreen } from '@/lib/useCRDashboard';
import AppShell from '../components/AppShell';

const semesterOptions = Array.from({ length: MAX_SEMESTER }, (_, i) => i + 1);

const field =
  'w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-amber-500 text-slate-100';

function Row({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-4 py-3 border-b border-slate-800/70 last:border-b-0">
      <dt className="text-xs font-semibold text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-100 sm:text-right break-words">{children ?? '—'}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user, loadingAuth, crData, semester, selectSemester, updateProfile } = useCRDashboard();
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
      showToast('TG name cannot be empty.', 'error');
      return;
    }

    setProfileSaving(true);
    try {
      await updateProfile({ tgName, semester: sem });
      selectSemester(sem);
      setEditingProfile(false);
      showToast(`Profile updated. Default semester is ${sem}.`);
    } catch (error) {
      console.error(error);
      showToast('Could not update profile. Please try again.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  if (loadingAuth) return authLoadingScreen;
  if (!user) return null;

  return (
    <AppShell title="Profile" subtitle="Your details and default semester" toast={toast}>
      {editingProfile ? (
        <section className="bg-slate-900 border border-amber-500/50 rounded-2xl p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-amber-400 mb-4">Edit profile</h2>
          <form onSubmit={saveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tg" className="text-xs text-slate-400 block mb-1.5">
                TG name
              </label>
              <input
                id="tg"
                type="text"
                value={profileTg}
                onChange={(e) => setProfileTg(e.target.value)}
                required
                className={field}
              />
            </div>
            <div>
              <label htmlFor="sem" className="text-xs text-slate-400 block mb-1.5">
                Default semester
              </label>
              <select
                id="sem"
                value={profileSem}
                onChange={(e) => setProfileSem(Number(e.target.value))}
                className={field}
              >
                {semesterOptions.map((n) => (
                  <option key={n} value={n}>
                    Semester {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
              <button
                type="button"
                onClick={cancelEditProfile}
                className="px-5 py-3 rounded-xl text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileSaving}
                className="px-8 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {profileSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-base sm:text-lg font-semibold text-slate-200">My details</h2>
            <button
              onClick={startEditProfile}
              className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-500 hover:text-slate-950 transition-colors"
            >
              Edit
            </button>
          </div>
          <dl>
            <Row label="CR name">{crData?.crName}</Row>
            <Row label="CR user ID">
              {crData?.userId ? (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(crData.userId);
                    showToast(`Copied ${crData.userId}`);
                  }}
                  title="Tap to copy"
                  className="font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500 hover:text-white transition-colors"
                >
                  {crData.userId}
                </button>
              ) : (
                <span className="text-slate-500 italic text-xs">Assigned on next login</span>
              )}
            </Row>
            <Row label="Roll number">{crData?.crRollNumber}</Row>
            <Row label="College">{crData?.collegeName}</Row>
            <Row label="Branch">{crData?.branch}</Row>
            <Row label="Section">{crData?.section}</Row>
            <Row label="Default semester">
              {crData?.semester ? `Semester ${crData.semester}` : 'Semester 1'}
            </Row>
            <Row label="TG name">{crData?.tgName}</Row>
            <Row label="Email">{crData?.email || user?.email}</Row>
          </dl>
        </section>
      )}

      {/* Sidebar already has Log out on laptops; show it here for phones */}
      <button
        onClick={() => signOut(auth)}
        className="lg:hidden w-full bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-rose-500 hover:text-white transition-colors"
      >
        Log out
      </button>
    </AppShell>
  );
}