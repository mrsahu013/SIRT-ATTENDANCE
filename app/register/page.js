// app/register/page.js
"use client";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
} from "firebase/auth";
import { ref, set, get, child } from "firebase/database";
import { useRouter } from "next/navigation";
import { MAX_SEMESTER } from "@/lib/config";
import { ensureUserId } from "@/lib/userId";

const friendlyError = (err) => {
  switch (err?.code) {
    case "auth/email-already-in-use":
      return "This email is already registered. Please log in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";
    default:
      return err?.message || "Something went wrong. Please try again.";
  }
};

const inputClass =
  "w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200";

const semesterOptions = Array.from({ length: MAX_SEMESTER }, (_, i) => i + 1);

export default function Register() {
  const [email, setEmail] = useState("");
  const [emailLocked, setEmailLocked] = useState(false); // locked only for Google users
  const [password, setPassword] = useState("");
  const [crName, setCrName] = useState("");
  const [crRollNumber, setCrRollNumber] = useState("");
  const [collegeName, setCollegeName] = useState("");
  const [branch, setBranch] = useState("");
  const [section, setSection] = useState("");
  const [semester, setSemester] = useState(1);
  const [tgName, setTgName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && currentUser.email) {
        setEmail(currentUser.email);
        setEmailLocked(true);

        // Already registered? Go straight to dashboard.
        try {
          const snap = await get(child(ref(db), `users/${currentUser.uid}`));
          if (snap.exists() && snap.val().tgName) {
            router.push("/");
            return;
          }
        } catch (e) {
          console.error(e);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      let user = auth.currentUser;

      if (user) {
        // Signed in with Google: link email/password so they can also log in with it
        const credential = EmailAuthProvider.credential(user.email, password);
        try {
          await linkWithCredential(user, credential);
        } catch (linkError) {
          // Already linked is fine; anything else should be shown
          if (linkError.code !== "auth/provider-already-linked") {
            throw linkError;
          }
        }
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        user = userCredential.user;
      }

      const profile = {
        crName: crName.trim(),
        crRollNumber: crRollNumber.trim(),
        collegeName: collegeName.trim(),
        branch: branch.trim(),
        section: section.trim(),
        semester: Number(semester), // 1-8, used as the default semester on the dashboard
        tgName: tgName.trim(),
        email: user.email,
        uid: user.uid,
      };

      await set(ref(db, `users/${user.uid}`), profile);

      // Allocate the permanent unique user ID (dashboard retries on login if this fails)
      try {
        await ensureUserId(user.uid);
      } catch (idErr) {
        console.error("User ID allocation failed, will retry on login", idErr);
      }

      router.push("/");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400 text-sm">
            Loading registration portal...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2 text-center">
          CR Registration Portal
        </h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          Create your account and fill out your class details
        </p>

        {error && (
          <p className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-4 text-sm">
            {error}
          </p>
        )}

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          {/* Account Credentials */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
            <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Account Credentials
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Email Address {emailLocked && "(Locked)"}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={emailLocked}
                required
                placeholder="you@college.edu"
                className={
                  emailLocked
                    ? "w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm text-slate-400 cursor-not-allowed select-none focus:outline-none"
                    : inputClass
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Set Password (For Email Login)
              </label>
              <input
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
          </div>

          {/* CR Profile Details */}
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mt-2">
              Class Representative Details
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                CR Full Name
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={crName}
                onChange={(e) => setCrName(e.target.value)}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                CR Roll Number
              </label>
              <input
                type="text"
                placeholder="e.g. 210101"
                value={crRollNumber}
                onChange={(e) => setCrRollNumber(e.target.value)}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                College Name
              </label>
              <input
                type="text"
                placeholder="e.g. Institute of Technology"
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                required
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Branch
                </label>
                <input
                  type="text"
                  placeholder="e.g. CSE / Civil"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Section
                </label>
                <input
                  type="text"
                  placeholder="e.g. A"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Current Semester
                </label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                  className={inputClass}
                >
                  {semesterOptions.map((n) => (
                    <option key={n} value={n}>
                      Semester {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Teacher Guardian (TG) Name
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. Smith"
                value={tgName}
                onChange={(e) => setTgName(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 text-center mt-2">
            By registering you agree to our{" "}
            <a href="/privacy" className="text-cyan-400 hover:underline">
              Privacy Policy
            </a>
            .
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white p-3.5 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-cyan-900/20"
          >
            {submitting ? "Creating account..." : "Complete Registration"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          Already have an account?{" "}
          <a
            href="/login"
            className="text-cyan-400 hover:underline font-medium"
          >
            Login here
          </a>
        </p>
      </div>
    </div>
  );
}
