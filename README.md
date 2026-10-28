# Mark Student

A web app for Class Representatives (CRs) to manage their class students and take daily attendance. An admin can view all CRs, students and attendance records, and send announcements.

## Features

**For CRs**
- Register and log in with email/password or Google
- Reset a forgotten password by email
- Add, edit and delete students
- Bulk upload students by typing them in, uploading a CSV, or generating a roll number range
- Mark attendance for the day (Mark All / Unmark All)
- Download the attendance report as a JPG
- Copy the attendance summary as WhatsApp text
- Attendance records are deleted automatically after 2 days

**For the admin**
- Overview of total CRs and students
- Search CRs by name, roll number, college, branch or email
- View each CR's students and attendance logs
- Delete a CR along with their data
- Broadcast an announcement

## Tech Stack

- Next.js (App Router)
- React
- Tailwind CSS
- Firebase Authentication
- Firebase Realtime Database
- html2canvas (for JPG export)

## Project Structure

```
app/
├── admin/             Admin dashboard
├── components/        Footer
├── forgot-password/   Password reset page
├── login/             Login page
├── register/          CR registration page
├── globals.css
├── icon.svg
├── layout.tsx         Root layout
└── page.jsx           CR dashboard (home)
lib/
└── firebase.js        Firebase setup
```

## Getting Started

### Requirements
- Node.js 18 or newer
- Yarn
- A Firebase project with **Authentication** (Email/Password and Google) and **Realtime Database** enabled

### Setup

1. Clone the repo and go into the folder

   ```bash
   git clone <https://github.com/mrsahu013/SIRT-ATTENDANCE.git>
   cd markstudent
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

## Database Structure

```
users/{uid}                  CR profile (name, roll, college, branch, section, year, TG name, email)
students/{uid}/{studentId}   name, rollNumber
attendance/{uid}/{date}      date, timestamp, present[], absent[]
announcements/global         message, timestamp
```

## How to Use

1. Register as a CR with your class details.
2. Log in and add your students (one by one or in bulk).
3. Pick today's date, tick the students who are present and click **Save Attendance**.
4. Download the JPG or copy the WhatsApp text and share it.

### Bulk upload format

One student per line, in the format `Name, Roll Number`:

```
John Doe,0133CI251178
Jane Smith,0133CI251179
```

## Known Limitations

- The admin check is done in the browser, so Firebase Realtime Database security rules must also be set to protect the data.
- Deleting a CR removes their database records but not their Firebase Authentication account.
- Attendance can only be marked for the current date.

## Author

Made by `RamPravesh Saw` as a college project.