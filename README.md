# Mark Student

Attendance app for Class Representatives (CRs). Keep one student list, mark
daily attendance for Semester 1 to 8, and share the result on WhatsApp or as a JPG.

Built with Next.js (App Router), Tailwind CSS and Firebase (Authentication and Realtime Database).

## Features

- CR registration with email/password or Google, plus a unique 10-digit user ID
- One shared student roster, bulk upload (CSV or roll-number range)
- Semester-wise attendance (Sem 1 to 8), kept for 180 days
- Progress page with per-semester and per-student percentages (below 75% shown in red)
- Share as WhatsApp text or download as a JPG
- Admin panel: CR management, attendance logs, broadcast announcements, user messages
- Contact page (no login needed): send feedback, a problem report or a question.
  You get a code like `MS-K7P2X9QF4M` and can check the admin's reply with it.
- Privacy policy page

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

## Environment variables

Put these in `.env.local` and in your hosting provider's environment settings.

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# The one admin account (used by /admin and the database rules)
NEXT_PUBLIC_MASTER_ADMIN_EMAIL=you@gmail.com

# Optional: shown on the Contact page
NEXT_PUBLIC_CONTACT_EMAIL=you@gmail.com
```

## Database rules

1. Open Firebase Console, Realtime Database, Rules.
2. Paste the contents of `database.rules.json`.
3. Replace every `YOUR_ADMIN_EMAIL@example.com` with your admin email, in lowercase.
   It must match `NEXT_PUBLIC_MASTER_ADMIN_EMAIL`.
4. Publish.

The admin check also requires `email_verified`. Log in to `/admin` with
**Google sign-in**, which is always verified. An email/password account for the
admin address works only after the email has been verified.

## Data model

| Path | Content |
| --- | --- |
| `users/{uid}` | CR profile (name, roll, college, branch, section, semester, TG, userId) |
| `students/{uid}/{sid}` | `name`, `rollNumber` |
| `attendance/{uid}/sem{1-8}/{YYYY-MM-DD}` | `date`, `semester`, `timestamp`, `present[]`, `absent[]` |
| `userIds/{10-digit}` | uid that owns the ID |
| `announcements/global` | `message`, `timestamp` |
| `messages/{ticket}` | `name`, `email`, `type`, `message`, `createdAt`, `status` (`new`, `read`, `replied`), `reply`, `repliedAt` |

## Routes

| Route | Access |
| --- | --- |
| `/`, `/students`, `/progress`, `/profile` | Logged-in CRs |
| `/login`, `/register`, `/forgot-password`, `/privacy`, `/contact` | Public |
| `/admin` | Admin email only (checked in the page and in the database rules) |

Public routes are listed in `PUBLIC_PATHS` in `lib/useCRDashboard.js`.
Add a new public page there, or logged-out visitors are sent to `/login`.

## Updating the policy date

Change `LAST_UPDATED` in `lib/config.js`. The privacy page and the footer both read it.

## Notes

- Contact messages can be sent by anyone. If you get spam, enable Firebase App Check.
- Anyone who has a message code can read that message and its reply, so codes are long and random.
- Attendance older than 180 days is removed when a CR opens their dashboard.