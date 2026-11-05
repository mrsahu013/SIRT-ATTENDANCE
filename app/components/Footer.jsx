// app/components/Footer.jsx  (server component: no "use client" needed)
import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-300 pb-24 lg:pb-0">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:justify-between gap-6 mb-8">
          <div>
            <h3 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">
              Mark Student
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md">
              Attendance for Class Representatives: keep a student list, mark
              daily attendance and share the result.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-200 mb-3">MOJIHIKE</h4>
            <ul className="flex sm:flex-col gap-5 sm:gap-2">
              <li>
                <Link
                  href="/contact"
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

        <div className="border-t border-slate-800 pt-6 text-center sm:text-left">
          <p className="text-xs text-slate-500">
            &copy; {currentYear}{" "}
            <span className="text-cyan-400">Mark Student</span>. All rights
            reserved.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Version 1.0.0 &middot; Last updated 28 October 2026
          </p>
        </div>
      </div>
    </footer>
  );
}