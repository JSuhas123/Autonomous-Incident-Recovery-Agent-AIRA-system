11.8 Secrets / Credential Boundary Hardening

✅ Passwords stored only as Argon2 hashes
✅ passwordHash excluded from normal queries
✅ passwordHash removed from toJSON()
✅ passwordHash removed from toObject()
✅ invalid plaintext/non-Argon2 credential persistence blocked

✅ Session raw tokens never persisted
✅ only tokenHash stored
✅ 256-bit random session tokens
✅ HttpOnly cookies
✅ Secure cookies in production
✅ __Host- cookie naming in production
✅ session expiry + revocation preserved

✅ IP addresses keyed-fingerprinted
✅ User-Agent keyed-fingerprinted
✅ no predictable production fingerprint salt
✅ production requires SESSION_FINGERPRINT_KEY

✅ Integration secrets encrypted using AES-256-GCM
✅ random IV per encryption
✅ authentication-tag integrity protection
✅ tampered ciphertext fails closed
✅ missing production integration key fails closed
✅ plaintext integration secrets not persisted

✅ Unknown user / wrong password use generic INVALID_CREDENTIALS
✅ account-state disclosure moved after password proof
✅ lock state no longer disclosed to password guessers
✅ failed-attempt lockout preserved
✅ password hash migration/rehash preserved

✅ credential/session boundaries never grant execution authority

✅ Phase 11.8 certification suite passed