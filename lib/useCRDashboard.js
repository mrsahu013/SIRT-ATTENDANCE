// lib/useCRDashboard.js
"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, get, child, update, set } from "firebase/database";
import { getLocalDate, shiftDate } from "./dateUtils";
import { RETENTION_DAYS, MAX_SEMESTER } from "./config";
import { ensureUserId } from "./userId";

// Pages that manage their own auth. The provider never redirects or loads data here.
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/privacy",
  "/contact",
  "/admin",
];

const isPublicPath = (pathname) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

const DISMISSED_KEY = "dismissedAnnouncement";
const SEMESTER_KEY = "ms_semester";
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Toast ----------
export function useToast() {
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  return { toast, showToast };
}

// ---------- Helpers ----------

// Flatten a semester-wise roster into one shared roster (legacy data fix-up).
const flattenRoster = (raw) => {
  const merged = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (/^sem[1-8]$/.test(k) && v && typeof v === "object") {
      Object.entries(v).forEach(([sid, s]) => {
        if (s && s.name && !merged[sid]) merged[sid] = s;
      });
    } else if (v && v.name) {
      merged[k] = v;
    }
  });
  return merged;
};

// Build { [semNum]: { dateKey: record } } and collect records older than retention.
const organizeAttendance = (uid, rawAtt) => {
  const cutoff = shiftDate(getLocalDate(), -(RETENTION_DAYS - 1));
  const cleanup = {};
  const hist = {};

  const add = (semNum, dateKey, record, path) => {
    if (dateKey < cutoff) {
      cleanup[path] = null;
      return;
    }
    if (!hist[semNum]) hist[semNum] = {};
    hist[semNum][dateKey] = record;
  };

  Object.entries(rawAtt).forEach(([key, val]) => {
    // Legacy flat record: attendance/<uid>/<YYYY-MM-DD> -> Semester 1
    if (DATE_KEY_RE.test(key)) {
      add(1, key, val, `attendance/${uid}/${key}`);
      return;
    }

    const m = /^sem(\d+)$/.exec(key);
    if (!m || !val || typeof val !== "object") return;

    const semNum = Math.min(Math.max(parseInt(m[1], 10) || 1, 1), MAX_SEMESTER);
    Object.entries(val).forEach(([dateKey, record]) => {
      add(semNum, dateKey, record, `attendance/${uid}/${key}/${dateKey}`);
    });
  });

  return { hist, cleanup };
};

// ---------- Context ----------
const DashboardContext = createContext(null);

// Put this once in app/layout.tsx. Data is fetched once and shared by all pages.
export function CRDashboardProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const isProtected = !isPublicPath(pathname);

  const [user, setUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);

  const [crData, setCrData] = useState(null);
  const [students, setStudents] = useState({});
  const [historyTree, setHistoryTree] = useState({}); // { [semNum]: { date: record } }
  const [announcement, setAnnouncement] = useState(null);
  const [dismissedTs, setDismissedTs] = useState(0);
  const [semester, setSemesterState] = useState(1);

  const [loadedUid, setLoadedUid] = useState(null); // uid whose data is fully loaded
  const [loadError, setLoadError] = useState(null);

  const uidRef = useRef(null); // last seen auth uid
  const loadToken = useRef(0); // ignore results of stale loads
  const loadingUidRef = useRef(null); // prevents duplicate parallel loads

  // ----- Auth listener: only tracks who is signed in -----
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const nextUid = currentUser ? currentUser.uid : null;

      if (uidRef.current !== nextUid) {
        // Different user (or logout): drop everything belonging to the old one
        uidRef.current = nextUid;
        loadToken.current++;
        loadingUidRef.current = null;
        setCrData(null);
        setStudents({});
        setHistoryTree({});
        setAnnouncement(null);
        setLoadedUid(null);
        setLoadError(null);
      }

      setUser(currentUser);
      setAuthResolved(true);
    });
    return () => unsubscribe();
  }, []);

  // ----- Load everything in one parallel round trip -----
  const load = useCallback(
    async (currentUser) => {
      const uid = currentUser.uid;
      const token = ++loadToken.current;
      loadingUidRef.current = uid;
      setLoadError(null);

      try {
        const dbRef = ref(db);
        const [crSnap, studentsSnap, attSnap, annSnap] = await Promise.all([
          get(child(dbRef, `users/${uid}`)),
          get(child(dbRef, `students/${uid}`)),
          get(child(dbRef, `attendance/${uid}`)),
          get(child(dbRef, "announcements/global")).catch(() => null),
        ]);

        if (token !== loadToken.current) return; // a newer load/logout took over

        // Not registered yet -> registration page
        if (!crSnap.exists() || !crSnap.val().tgName) {
          router.replace("/register");
          return;
        }

        let profile = crSnap.val();
        if (!profile.userId) {
          try {
            profile = { ...profile, userId: await ensureUserId(uid) };
          } catch (idErr) {
            console.error("Could not allocate user ID", idErr);
          }
          if (token !== loadToken.current) return;
        }

        // Roster (fix legacy semester-wise roster once)
        let rawStudents = studentsSnap.exists() ? studentsSnap.val() : {};
        if (Object.keys(rawStudents).some((k) => /^sem[1-8]$/.test(k))) {
          rawStudents = flattenRoster(rawStudents);
          await set(ref(db, `students/${uid}`), rawStudents);
          if (token !== loadToken.current) return;
        }

        // Attendance + retention cleanup (fire and forget)
        const rawAtt = attSnap.exists() ? attSnap.val() : {};
        const { hist, cleanup } = organizeAttendance(uid, rawAtt);
        if (Object.keys(cleanup).length) {
          update(ref(db), cleanup).catch((e) =>
            console.error("Cleanup failed", e),
          );
        }

        // Starting semester: saved preference -> profile default -> 1
        let initialSem = 0;
        try {
          const stored = Number(localStorage.getItem(SEMESTER_KEY)) || 0;
          if (stored >= 1 && stored <= MAX_SEMESTER) initialSem = stored;
        } catch {}
        if (!initialSem) {
          const p = Number(profile.semester);
          initialSem = p >= 1 && p <= MAX_SEMESTER ? p : 1;
        }

        // One batch of state updates, then mark ready
        setCrData(profile);
        setStudents(rawStudents);
        setHistoryTree(hist);
        setAnnouncement(annSnap && annSnap.exists() ? annSnap.val() : null);
        setSemesterState(initialSem);
        setLoadedUid(uid);
      } catch (err) {
        if (token !== loadToken.current) return;
        console.error(err);
        setLoadError(err);
        setLoadedUid(uid); // stop the spinner; pages can show the error state
      } finally {
        if (token === loadToken.current) loadingUidRef.current = null;
      }
    },
    [router],
  );

  // ----- Decide what to do whenever auth / route changes -----
  useEffect(() => {
    if (!authResolved) return;

    if (!user) {
      if (isProtected) router.replace("/login");
      return;
    }

    if (!isProtected) return; // login / register / admin / privacy manage themselves
    if (loadedUid === user.uid) return; // already loaded, nothing to fetch
    if (loadingUidRef.current === user.uid) return; // load already running

    load(user);
  }, [authResolved, user, isProtected, loadedUid, load, router]);

  // Dismissed announcement timestamp (read once)
  useEffect(() => {
    try {
      setDismissedTs(Number(localStorage.getItem(DISMISSED_KEY)) || 0);
    } catch {}
  }, []);

  // ----- Actions (stable references) -----
  const selectSemester = useCallback((next) => {
    if (!next || next < 1 || next > MAX_SEMESTER) return;
    setSemesterState(next);
    try {
      localStorage.setItem(SEMESTER_KEY, String(next));
    } catch {}
  }, []);

  const updateProfile = useCallback(
    async (fields) => {
      if (!user) throw new Error("Not signed in");
      await update(ref(db, `users/${user.uid}`), fields);
      setCrData((prev) => ({ ...prev, ...fields }));
    },
    [user],
  );

  const dismissAnnouncement = useCallback(() => {
    if (!announcement?.timestamp) return;
    try {
      localStorage.setItem(DISMISSED_KEY, String(announcement.timestamp));
    } catch {}
    setDismissedTs(announcement.timestamp);
  }, [announcement]);

  // Manual re-fetch if you ever need it (e.g. a "Refresh" button)
  const reload = useCallback(() => {
    if (user) return load(user);
  }, [user, load]);

  const showAnnouncement = !!(
    announcement?.message && announcement.timestamp > dismissedTs
  );

  // Spinner until auth is known AND (on dashboard pages) all data is loaded
  const loadingAuth =
    !authResolved || (isProtected && (!user || loadedUid !== user.uid));

  const value = useMemo(
    () => ({
      user,
      loadingAuth,
      loadError,
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
      reload,
    }),
    [
      user,
      loadingAuth,
      loadError,
      crData,
      students,
      historyTree,
      announcement,
      showAnnouncement,
      dismissAnnouncement,
      semester,
      selectSemester,
      updateProfile,
      reload,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

// Same API as before, so existing pages keep working unchanged.
export function useCRDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useCRDashboard must be used inside <CRDashboardProvider>");
  }
  return ctx;
}

// Simple loading screen shared by pages
export const authLoadingScreen = (
  <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
    <div className="text-center">
      <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
      <p className="text-slate-400 text-sm">Loading your dashboard...</p>
    </div>
  </div>
);
