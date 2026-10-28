import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Mark Student",
  description: "How Mark Student collects, uses and protects your data.",
};

const LAST_UPDATED = "October 28, 2026";
const CONTACT_URL = "https://www.mojihike.online/contact";

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-slate-200 mb-3">{title}</h2>
      <div className="text-sm text-slate-400 leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 md:p-10">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">
          Privacy Policy
        </h1>
        <p className="text-xs text-slate-500 mb-8">
          Last updated: {LAST_UPDATED}
        </p>

        <Section title="1. About this app">
          <p>
            Mark Student is an attendance management tool for Class
            Representatives (CRs). It lets a CR keep a list of students in their
            class, mark daily attendance and share the result. This policy
            explains what data the app stores and how it is used.
          </p>
        </Section>

        <Section title="2. Information we collect">
          <p>
            <span className="text-slate-200 font-medium">
              CR account details:
            </span>{" "}
            email address, password (handled by Firebase Authentication, we
            never see it in plain text), and if you sign in with Google, your
            Google account email and user ID.
          </p>
          <p>
            <span className="text-slate-200 font-medium">
              CR profile details:
            </span>{" "}
            your name, roll number, college name, branch, section, year and
            Teacher Guardian (TG) name.
          </p>
          <p>
            <span className="text-slate-200 font-medium">
              Student details entered by the CR:
            </span>{" "}
            student names and roll numbers.
          </p>
          <p>
            <span className="text-slate-200 font-medium">
              Attendance records:
            </span>{" "}
            the date, and the lists of present and absent students for that
            date.
          </p>
        </Section>

        <Section title="3. How we use your information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To create your account and log you in.</li>
            <li>To show your student list and let you mark attendance.</li>
            <li>
              To create the attendance report (JPG image or WhatsApp text) that
              you choose to share.
            </li>
            <li>
              To let the administrator manage accounts and send announcements.
            </li>
          </ul>
          <p>We do not sell your data, show ads, or use it for marketing.</p>
        </Section>

        <Section title="4. Where data is stored">
          <p>
            Data is stored with Google Firebase (Authentication and Realtime
            Database). Firebase is a third-party service, so its own privacy
            policy and security practices also apply. The attendance JPG is
            generated inside your browser and is not uploaded to our servers.
          </p>
        </Section>

        <Section title="5. Who can see the data">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              You can see the profile, students and attendance you created.
            </li>
            <li>
              The app administrator can view all CR profiles, student lists and
              attendance records, and can delete a CR account's data.
            </li>
            <li>
              Anything you share yourself, such as a downloaded JPG or copied
              WhatsApp text, is outside the app and is your responsibility.
            </li>
          </ul>
        </Section>

        <Section title="6. How long we keep data">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Attendance records are removed automatically after 2 days. The
              cleanup runs when a CR opens their dashboard, so a record may stay
              a little longer if the CR has not logged in.
            </li>
            <li>
              Student lists and CR profiles are kept until you delete them or
              the administrator removes your account.
            </li>
          </ul>
        </Section>

        <Section title="7. Student data and consent">
          <p>
            CRs add student names and roll numbers on their own. By doing so,
            the CR confirms that they are allowed to share this information for
            attendance purposes within their class and college. Please only
            enter what is needed for attendance.
          </p>
        </Section>

        <Section title="8. Cookies and local storage">
          <p>
            The app uses browser storage only to keep you signed in through
            Firebase Authentication. We do not use advertising or tracking
            cookies.
          </p>
        </Section>

        <Section title="9. Security">
          <p>
            We use Firebase Authentication to protect accounts and database
            rules to limit who can read and write data. No system is completely
            secure, so please use a strong password and log out on shared
            devices.
          </p>
        </Section>

        <Section title="10. Your choices">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              You can edit or delete any student from your dashboard at any
              time.
            </li>
            <li>
              You can ask for your account and all related data to be deleted by
              contacting us using the link below.
            </li>
          </ul>
        </Section>

        <Section title="11. Children">
          <p>
            This app is meant for college CRs and students. It is not intended
            for children under 13, and we do not knowingly collect their data.
          </p>
        </Section>

        <Section title="12. Changes to this policy">
          <p>
            We may update this policy from time to time. The date at the top of
            this page shows when it was last changed.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            For questions or data deletion requests, contact us through{" "}
            <a href={CONTACT_URL} className="text-cyan-400 hover:underline">
              our contact page
            </a>
            .
          </p>
        </Section>

        <div className="pt-6 border-t border-slate-800">
          <Link href="/" className="text-sm text-cyan-400 hover:underline">
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
