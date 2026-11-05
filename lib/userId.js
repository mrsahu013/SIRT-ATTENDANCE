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

async function allocateUserId(uid) {
  const existing = await get(ref(db, `users/${uid}/userId`));
  if (existing.exists()) return existing.val();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomTenDigitId();

    // Atomic claim: only one CR can ever own a given number
    const result = await runTransaction(
      ref(db, `userIds/${candidate}`),
      (current) => {
        if (current !== null) return; // taken -> abort, try another number
        return uid; // free -> claim it
      },
    );

    if (!result.committed) continue; // collision, generate a new one

    await update(ref(db), { [`users/${uid}/userId`]: candidate });
    return candidate;
  }

  throw new Error("Could not allocate a unique user ID. Please try again.");
}

// If register and the dashboard call this at the same moment, they share one
// allocation instead of each claiming a different ID.
const inflight = new Map();

export function ensureUserId(uid) {
  if (!inflight.has(uid)) {
    const promise = allocateUserId(uid).finally(() => inflight.delete(uid));
    inflight.set(uid, promise);
  }
  return inflight.get(uid);
}
