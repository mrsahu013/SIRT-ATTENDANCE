// app/register/page.js
'use client';
import { useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { useRouter } from 'next/navigation';

export default function RegisterCR() {
  const [form, setForm] = useState({
    crName: '',
    crRollNumber: '',
    email: '',
    password: '',
    branch: '',
    section: '',
    year: '',
    tgName: '',
    collegeName: ''
  });
  const [error, setError] = useState('');
  const router = useRouter();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid = userCredential.user.uid;

      // 2. Save CR Profile data in Realtime Database
      await set(ref(db, `users/${uid}`), {
        crName: form.crName,
        crRollNumber: form.crRollNumber,
        email: form.email,
        branch: form.branch,
        section: form.section,
        year: form.year,
        tgName: form.tgName,
        collegeName: form.collegeName,
        uid: uid
      });

      alert('CR Account Created Successfully!');
      router.push('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-6 text-center">
          CR Account Registration
        </h1>
        {error && <p className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-4 text-sm">{error}</p>}
        
        <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input 
            type="text" 
            name="crName" 
            placeholder="CR Full Name" 
            value={form.crName} 
            onChange={handleChange} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <input 
            type="text" 
            name="crRollNumber" 
            placeholder="CR Roll Number" 
            value={form.crRollNumber} 
            onChange={handleChange} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <input 
            type="email" 
            name="email" 
            placeholder="Email Address" 
            value={form.email} 
            onChange={handleChange} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <input 
            type="password" 
            name="password" 
            placeholder="Password" 
            value={form.password} 
            onChange={handleChange} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <input 
            type="text" 
            name="branch" 
            placeholder="Branch (e.g. CSIT)" 
            value={form.branch} 
            onChange={handleChange} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <input 
            type="text" 
            name="section" 
            placeholder="Section (e.g. D)" 
            value={form.section} 
            onChange={handleChange} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <input 
            type="text" 
            name="year" 
            placeholder="Year (e.g. 2nd Year)" 
            value={form.year} 
            onChange={handleChange} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <input 
            type="text" 
            name="tgName" 
            placeholder="Teacher Guardian (TG) Name" 
            value={form.tgName} 
            onChange={handleChange} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500" 
          />
          <input 
            type="text" 
            name="collegeName" 
            placeholder="College Name" 
            value={form.collegeName} 
            onChange={handleChange} 
            required 
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-500 md:col-span-2" 
          />
          
          <button 
            type="submit" 
            className="md:col-span-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white p-3.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20 mt-2">
            Register as CR
          </button>
        </form>
      </div>
    </div>
  );
}