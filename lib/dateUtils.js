// lib/dateUtils.js

// Local date as YYYY-MM-DD (NOT UTC). Fixes the "yesterday after midnight IST" bug.
export const getLocalDate = (d = new Date()) => {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split("T")[0];
};

// Shift a YYYY-MM-DD string by N days (negative = past)
export const shiftDate = (dateStr, days) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return getLocalDate(new Date(y, m - 1, d + days));
};

// Trim, remove spaces, uppercase -> consistent roll numbers for duplicate checks
export const normalizeRoll = (roll) =>
  String(roll || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

// 2026-11-03 -> 03/11/2026 (Indian style DD/MM/YYYY). Storage stays YYYY-MM-DD.
export const formatDate = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
};

// Safe for file names (no slashes): 03-11-2026
export const formatDateForFile = (dateStr) =>
  formatDate(dateStr).replace(/\//g, "-");
