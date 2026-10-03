// app/register/page.js
'use client';
import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential, 
  onAuthStateChanged 
} from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { useRouter } from 'next/navigation';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [crName, setCrName] = useState('');
  const [crRollNumber, setCrRollNumber] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [branch, setBranch] = useState('');
  const [section, setSection] = useState('');
  const [year, setYear] = useState('');
  const [tgName, setTgName] = useState('');
  const [loading, setLoading] = useState(true);
  
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email) {
        setEmail(currentUser.email);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      let user = auth.currentUser;

      if (user) {
        // Agar user Google se signed-in hai, toh uske account me email/password link kar do
        // Taki wo baad me email/password se bhi login kar sake.
        const credential = EmailAuthProvider.credential(email, password);
        try {
          await linkWithCredential(user, credential);
        } catch (linkError) {
          // Agar credential pehle se linked hai ya koi aur choti error ho, toh ignore karke aage badh sakte hain
          console.log("Linking note:", linkError.message);
        }
      } else {
        // Agar bilkul naya user hai bina Google login ke
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
      }

      // CR profile payload tied to the user's UID
      const crData = {
        crName,
        crRollNumber,
        collegeName,
        branch,
        section,
        year,
        tgName,
        email: user.email,
        uid: user.uid
      };

      // Save CR profile data to Realtime Database
      await set(ref(db, `users/${user.uid}`), crData);
      
      alert("Registration & Account Setup Successful!");
      router.push('/');
    } catch (error) {
      alert("Error during registration: " + error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400 text-sm">Loading registration portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2 text-center">
          CR Registration Portal
        </h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          Create your account and fill out your class details
        </p>

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          {/* Account Credentials */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
            <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Account Credentials</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Email Address (Locked)</label>
              <input 
                type="email" 
                value={email} 
                readOnly 
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm text-slate-400 cursor-not-allowed select-none focus:outline-none" 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Set Password (For Email Login)</label>
              <input 
                type="password" 
                placeholder="At least 6 characters" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                minLength={6}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200" 
              />
            </div>
          </div>

          {/* CR Profile Details */}
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mt-2">Class Representative Details</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">CR Full Name</label>
              <input 
                type="text" 
                placeholder="e.g. John Doe" 
                value={crName} 
                onChange={(e) => setCrName(e.target.value)} 
                required 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200" 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">CR Roll Number</label>
              <input 
                type="text" 
                placeholder="e.g. 210101" 
                value={crRollNumber} 
                onChange={(e) => setCrRollNumber(e.target.value)} 
                required 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200" 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">College Name</label>
              <input 
                type="text" 
                placeholder="e.g. Institute of Technology" 
                value={collegeName} 
                onChange={(e) => setCollegeName(e.target.value)} 
                required 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200" 
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Branch</label>
                <input 
                  type="text" 
                  placeholder="e.g. CSE / Civil" 
                  value={branch} 
                  onChange={(e) => setBranch(e.target.value)} 
                  required 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Section</label>
                <input 
                  type="text" 
                  placeholder="e.g. A" 
                  value={section} 
                  onChange={(e) => setSection(e.target.value)} 
                  required 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Year</label>
                <input 
                  type="text" 
                  placeholder="e.g. 2nd Year" 
                  value={year} 
                  onChange={(e) => setYear(e.target.value)} 
                  required 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Teacher Guardian (TG) Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Dr. Smith" 
                  value={tgName} 
                  onChange={(e) => setTgName(e.target.value)} 
                  required 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200" 
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white p-3.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20 mt-4">
            Complete Registration
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          Don't have an account? <a href="/login" className="text-cyan-400 hover:underline font-medium">Login here</a>
        </p>
      </div>
    </div>
  );
}