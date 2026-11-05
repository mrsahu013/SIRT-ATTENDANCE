// lib/sort.js
const collator = new Intl.Collator(undefined, { numeric: true });

// For [id, student] entries
export const byRoll = (a, b) =>
  collator.compare(a[1].rollNumber, b[1].rollNumber);
