# Mark Student

A web app for Class Representatives (CRs) to manage their class students and take daily attendance, semester by semester. An admin can view all CRs, students and attendance records, and send announcements.

The layout works on phones and laptops: a sidebar on large screens, and a top bar with bottom tabs on phones.

## Features

**For CRs**
- Register and log in with email/password or Google
- Reset a forgotten password by email
- Get a unique, permanent 10-digit user ID
- Keep one student list that is shared across Semester 1 to 8
- Add, edit, delete and search students
- Bulk upload students by typing them in, uploading a CSV, or generating a roll number range
- Mark attendance for any date in the last 180 days (Mark all present / Mark all absent)
- Save attendance per semester and overwrite a saved day
- See attendance percentage per semester and per student (below 75% is shown in red)
- Delete saved records from the Progress page
- Share the report on WhatsApp, copy it as text, or download it as a JPG
- Set a default semester and TG name in Profile
- See announcements from the admin
- Attendance records are deleted automatically after 180 days (about 6 months)

**For the admin**
- Overview: total CRs, total students, CRs who marked attendance today
- Search CRs by user ID, name, roll number, college, branch or email
- View each CR's students and attendance records
- Filter attendance logs by CR, date, semester and marked / not marked
- Delete a CR along with their data
- Broadcast an announcement to all CR dashboards

## Tech Stack

- Next.js (App Router)
- React
- Tailwind CSS
- Firebase Authentication
- Firebase Realtime Database
- html2canvas (for JPG export, loaded only when you download)

## Project Structure

```
app/
├── admin/             Admin dashboard
├── components/
│   ├── AppShell.jsx   Sidebar (laptop) and top bar + bottom tabs (phone)
│   ├── Footer.jsx
│   └── Toast.jsx
├── forgot-password/   Password reset page
├── login/             Login page
├── privacy/           Privacy policy
├── profile/           CR details, TG name, default semester
├── progress/          Semester and student attendance percentages, saved records
├── register/          CR registration page
├── students/          Student list and bulk upload
├── globals.css
├── icon.svg
├── layout.tsx         Root layout (wraps pages in CRDashboardProvider)
└── page.jsx           Mark attendance (home)
lib/
├── config.js          Retention days, minimum attendance %, max semester
├── dateUtils.js       Date and roll number helpers
├── firebase.js        Firebase setup
├── sort.js            Roll number sorting
├── useCRDashboard.js  Loads profile, students and attendance once for all pages
└── userId.js          Allocates the unique 10-digit user ID
```

## Getting Started

### Requirements
- Node.js 18 or newer
- Yarn
- A Firebase project with **Authentication** (Email/Password and Google) and **Realtime Database** enabled

### Setup

1. Clone the repo and go into the folder

   ```bash
   git clone https://github.com/mrsahu013/SIRT-ATTENDANCE.git
   cd SIRT-ATTENDANCE
   ```

2. Install dependencies

   ```bash
   yarn install
   ```

3. Create a `.env.local` file in the project root and add your Firebase details. Use the same variable names that `lib/firebase.js` reads.

   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

   # Email of the account that can open /admin
   NEXT_PUBLIC_MASTER_ADMIN_EMAIL=admin@example.com
   ```

   Do not commit `.env.local` to Git.

4. Start the development server

   ```bash
   yarn dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

### Other commands

```bash
yarn build   # create a production build
yarn start   # run the production build
yarn lint    # check the code for problems
```

### Settings

Edit `lib/config.js` to change:
- `RETENTION_DAYS` (default 180): how long attendance is kept
- `MIN_ATTENDANCE_PERCENT` (default 75): students below this are shown in red
- `MAX_SEMESTER` (default 8)

## Database Structure

```
users/{uid}                          CR profile: crName, crRollNumber, collegeName, branch,
                                     section, semester (default), tgName, email, uid, userId
userIds/{userId}                     uid that owns this 10-digit ID
students/{uid}/{studentId}           name, rollNumber (one list shared by all semesters)
attendance/{uid}/sem{1-8}/{date}     date, semester, timestamp, present[], absent[]
announcements/global                 message, timestamp
```

Dates are stored as `YYYY-MM-DD` and shown as `DD/MM/YYYY`.

## How to Use

1. Register as a CR with your class details and current semester.
2. Open **Students** and add your students (one by one or in bulk).
3. Open **Attendance**, choose the semester and date, untick students who are absent and tap **Save attendance**.
4. Share on WhatsApp, copy the text or download the JPG.
5. Open **Progress** to see attendance percentages per semester and per student.

### Bulk upload format

One student per line, in the format `Name, Roll Number`:

```
John Doe,0133CI251178
Jane Smith,0133CI251179
```

## Security

The admin check in the app runs in the browser, so it only hides the page. Protect the data with Realtime Database rules, for example:

- Each CR can read and write only `users/{uid}`, `students/{uid}` and `attendance/{uid}` for their own `uid`.
- Only the admin email can read all of `users`, `students` and `attendance`, and write `announcements`.
- Any signed-in user can read `announcements/global`.

Check your rules in the Firebase console before going live.

## Known Limitations

- Deleting a CR removes their database records but not their Firebase Authentication account.
- Attendance can be marked for today and the previous 180 days, not for future dates.
- The admin page downloads all users, students and attendance at once, so it will slow down as data grows.

## Author

Made by `RamPravesh Saw` as a college project.