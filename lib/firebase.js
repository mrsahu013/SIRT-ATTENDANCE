// lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  
    
    apiKey: "AIzaSyAWZqxjg6Vyu9fZOioa-6pRh85QpzICrS0",
    authDomain: "sirt-attendance.firebaseapp.com",
    projectId: "sirt-attendance",
    // databaseURL: "https://sirt-attendance-default-rtdb.firebaseio.com",
    
    databaseURL: "https://sirt-attendance-default-rtdb.asia-southeast1.firebasedatabase.app/",
    storageBucket: "sirt-attendance.firebasestorage.app",
    messagingSenderId: "254933346144",
    appId: "1:254933346144:web:514d7d3efc82f43f892005",
    measurementId: "G-FHTM6VNRG3"
};

// Initialize Firebase (prevent duplicate initialization in Next.js)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getDatabase(app);