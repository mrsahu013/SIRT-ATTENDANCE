// lib/userId.js
import { ref, runTransaction, get, update } from "firebase/database";
import { db } from "@/lib/firebase";

const MAX_ATTEMPTS = 15;

// Random 10-digit number, first digit never 0 (1000000000 - 9999999999)
const randomTenDigitId = () => {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const n = ((BigInt(buf[0]) << 32n) | BigInt(buf[1])) % 9000000000n;
  return String(1000000000n + n);
};

// Gives the CR a permanent, unique, 10-digit ID (if they don't have one yet).
// The ID is claimed with an atomic transaction on userIds/<id>, so even if two
// CRs register at the same instant, only one can ever own a given number.
export async function ensureUserId(uid) {
  const existing = await get(ref(db, `users/${uid}/userId`));
  if (existing.exists()) return existing.val();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomTenDigitId();

    const result = await runTransaction(
      ref(db, `userIds/${candidate}`),
      (current) => {
        if (current !== null) return; // already taken -> abort, try another number
        return uid; // free -> claim it
      },
    );

    if (!result.committed) continue; // collision, generate a new one

    await update(ref(db), { [`users/${uid}/userId`]: candidate });
    return candidate;
  }

  throw new Error("Could not allocate a unique user ID. Please try again.");
}
