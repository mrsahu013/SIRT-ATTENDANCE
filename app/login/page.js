// app/login/page.js
"use client";
import { useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup 
} from 'firebase/auth';
import { ref, get, child } from 'firebase/database';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if CR profile details already exist in the database
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, `users/${user.uid}`));

      if (snapshot.exists()) {
        // Profile exists, go to dashboard
        router.push('/');
      } else {
        // First time Google login, redirect to register/details page
        router.push('/register');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-6 text-center">
          CR Portal Login
        </h1>
        {error && <p className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-4 text-sm">{error}</p>}
        
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <input 
            type="email" 
            placeholder="Email Address" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <button 
            type="submit" 
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white p-3.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20">
            Login with Email
          </button>
        </form>

        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase">Or</span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-3.5 rounded-xl font-semibold hover:bg-slate-700 transition-all flex items-center justify-center gap-2">
          <span>Sign in with Google</span>
        </button>
      </div>
    </div>
  );
}