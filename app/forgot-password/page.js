// app/forgot-password/page.js
"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      // Firebase Auth secure password reset request
      await sendPasswordResetEmail(auth, email.trim());

      // Security Best Practice: Hamesha common message dikhayein
      // taaki attacker ko pata na chale ki email database mein hai ya nahi.
      setMessage(
        "If an account exists with this email, a password reset link has been sent. Please check your Inbox and Spam folder.",
      );
    } catch (err) {
      // Agar koi network error ya invalid format ho tabhi error dikhayein
      if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        // Security ke liye baaki sabhi cases mein bhi generic message rakhein
        setMessage(
          "If an account exists with this email, a password reset link has been sent. Please check your Inbox and Spam folder.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2 text-center">
          Reset Password
        </h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          Enter your email address and we'll send you a link to reset your
          password.
        </p>

        {error && (
          <p className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-4 text-sm">
            {error}
          </p>
        )}

        {message && (
          <p className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl mb-4 text-sm">
            {message}
          </p>
        )}

        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Email Address
            </label>
            <input
              type="email"
              placeholder="e.g. user@college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200 placeholder:text-slate-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white p-3.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-cyan-900/20 disabled:opacity-50"
          >
            {loading ? "Sending Link..." : "Send Reset Link"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          Remembered your password?{" "}
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
