// app/components/Footer.jsx
"use client";
import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-300">
      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-16">
        <div className="flex justify-between items-start mb-12">
          {/* Brand Section */}
          <div>
            <div className="mb-4">
              <h3 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                Mark Student
              </h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md">
              A modern attendance management system for Class Representatives to
              efficiently track and manage student attendance records.
            </p>
          </div>

          {/* Company Links - Right Side */}
          <div>
            <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">
              MOJIHIKE
            </h4>
            <ul>
              <li>
                <Link
                  href="https://www.mojihike.online/contact"
                  className="text-sm text-slate-400 hover:text-cyan-400 transition-colors"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-slate-400 hover:text-cyan-400 transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-800 pt-8">
          {/* Copyright */}
          <div className="text-center pt-6 border-t border-slate-800/50">
            <p className="text-xs text-slate-500">
              &copy; {currentYear}{" "}
              <span className="text-cyan-400">Mark Student</span>. All rights
              reserved. |<span className="text-slate-600"> Made with </span>
              <span className="text-rose-400">❤️</span>
              <span className="text-slate-600"> by the Team</span>
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Version 1.0.0 | Last Updated: 28 October 2026
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
