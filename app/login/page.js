// app/login/page.js
'use client';
import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2 text-center">
          CR Portal Login
        </h1>
        <p className="text-slate-400 text-sm text-center mb-6">Sign in to manage your class attendance</p>
        
        {error && <p className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-4 text-sm">{error}</p>}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Email Address</label>
            <input 
              type="email" 
              placeholder="Enter your email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Password</label>
            <input 
              type="password" 
              placeholder="Enter your password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
            />
          </div>
          
          <button 
            type="submit" 
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white p-3.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20 mt-2">
            Login
          </button>
        </form>

        <div className="text-center mt-6 text-sm text-slate-400">
          Don't have an account?{' '}
          <Link href="/register" className="text-cyan-400 font-medium hover:underline">
            Register as CR
          </Link>
        </div>
      </div>
    </div>
  );
}