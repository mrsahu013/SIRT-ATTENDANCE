// lib/useCRDashboard.js
"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, get, child, update, set } from "firebase/database";
import { getLocalDate, shiftDate } from "./dateUtils";
import { RETENTION_DAYS, MAX_SEMESTER } from "./config";
import { ensureUserId } from "./userId";

// Simple toast hook (each page renders its own Toast element)
export function useToast() {
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };
  return { toast, showToast };
}

const dismissedKey = "dismissedAnnouncement";

// Loads auth + CR profile + shared roster + per-semester attendance history.
// Returns everything a dashboard page needs.
export function useCRDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [crData, setCrData] = useState(null);
  const [students, setStudents] = useState({});
  const [historyTree, setHistoryTree] = useState({}); // { [semNum]: { date: record } }
  const [announcement, setAnnouncement] = useState(null);
  const [dismissedTs, setDismissedTs] = useState(0);

  // Selected semester (1-8). Applies to attendance + progress pages.
  const [semester, setSemesterState] = useState(1);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setLoadingAuth(false);
        setUser(null);
        setCrData(null);
        router.push("/login");
        return;
      }

      setUser(currentUser);
      try {
        const dbRef = ref(db);

        // CR profile
        const crSnap = await get(child(dbRef, `users/${currentUser.uid}`));
        if (!crSnap.exists() || !crSnap.val().tgName) {
          setLoadingAuth(false);
          router.push("/register");
          return;
        }

        let profile = crSnap.val();
        if (!profile.userId) {
          try {
            profile = {
              ...profile,
              userId: await ensureUserId(currentUser.uid),
            };
          } catch (idErr) {
            console.error("Could not allocate user ID", idErr);
          }
        }
        setCrData(profile);

        // Starting semester: saved preference -> profile default -> 1
        let initialSem;
        try {
          const stored = Number(localStorage.getItem("ms_semester")) || 0;
          if (stored >= 1 && stored <= MAX_SEMESTER) initialSem = stored;
        } catch {}
        if (!initialSem) {
          initialSem =
            Number(profile.semester) >= 1 &&
            Number(profile.semester) <= MAX_SEMESTER
              ? Number(profile.semester)
              : 1;
        }
        setSemesterState(initialSem);
        setLoadingAuth(false);

        // Students + attendance + announcement in parallel
        const [studentsSnap, attSnap, annSnap] = await Promise.all([
          get(child(dbRef, `students/${currentUser.uid}`)),
          get(child(dbRef, `attendance/${currentUser.uid}`)),
          get(child(dbRef, "announcements/global")).catch(() => null),
        ]);

        let rawStudents = studentsSnap.exists() ? studentsSnap.val() : {};
        const rawAtt = attSnap.exists() ? attSnap.val() : {};

        // One-time fix-up: flatten a semester-wise roster back to one shared roster
        const semChildren = Object.keys(rawStudents).some((k) =>
          /^sem[1-8]$/.test(k),
        );
        if (semChildren) {
          const merged = {};
          Object.entries(rawStudents).forEach(([k, v]) => {
            if (/^sem[1-8]$/.test(k) && v && typeof v === "object") {
              Object.entries(v).forEach(([sid, s]) => {
                if (!merged[sid]) merged[sid] = s;
              });
            } else if (v && v.name) {
              merged[k] = v;
            }
          });
          await set(ref(db, `students/${currentUser.uid}`), merged);
          rawStudents = merged;
        }

        // Organize attendance per semester + apply 6-month retention cleanup
        const cutoff = shiftDate(getLocalDate(), -(RETENTION_DAYS - 1));
        const cleanupUpdates = {};
        const hist = {};
        Object.entries(rawAtt).forEach(([semKeyStr, recs]) => {
          const semNum = Math.min(
            Math.max(
              parseInt(String(semKeyStr).replace("sem", ""), 10) || 1,
              1,
            ),
            MAX_SEMESTER,
          );
          const kept = {};
          Object.entries(recs || {}).forEach(([k, v]) => {
            if (k < cutoff) {
              cleanupUpdates[
                `attendance/${currentUser.uid}/${semKeyStr}/${k}`
              ] = null;
            } else {
              kept[k] = v;
            }
          });
          hist[semNum] = kept;
        });
        if (Object.keys(cleanupUpdates).length) {
          update(ref(db), cleanupUpdates).catch((e) =>
            console.error("Cleanup failed", e),
          );
        }

        setStudents(rawStudents);
        setHistoryTree(hist);
        if (annSnap && annSnap.exists()) setAnnouncement(annSnap.val());
      } catch (err) {
        console.error(err);
        setLoadingAuth(false);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Read the dismissed announcement timestamp once on mount
  useEffect(() => {
    try {
      setDismissedTs(Number(localStorage.getItem(dismissedKey)) || 0);
    } catch {}
  }, []);

  const selectSemester = (next) => {
    if (!next || next < 1 || next > MAX_SEMESTER) return;
    setSemesterState(next);
    try {
      localStorage.setItem("ms_semester", String(next));
    } catch {}
  };

  const updateProfile = async (fields) => {
    await update(ref(db, `users/${user.uid}`), fields);
    setCrData((prev) => ({ ...prev, ...fields }));
  };

  const showAnnouncement =
    announcement?.message && announcement.timestamp > dismissedTs;

  const dismissAnnouncement = () => {
    try {
      localStorage.setItem(dismissedKey, String(announcement.timestamp));
    } catch {}
    setDismissedTs(announcement.timestamp);
  };

  return {
    user,
    loadingAuth,
    crData,
    students,
    setStudents,
    historyTree,
    setHistoryTree,
    announcement,
    showAnnouncement,
    dismissAnnouncement,
    semester,
    selectSemester,
    updateProfile,
  };
}

// Simple loading screen shared by pages
export const authLoadingScreen = (
  <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
    <div className="text-center">
      <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
      <p className="text-slate-400 text-sm">Verifying authentication...</p>
    </div>
  </div>
);
