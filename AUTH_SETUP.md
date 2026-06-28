# Auth setup (Phase 1)

Add these to `backend/.env` (the `.env.example` file is access-restricted, so copy
these keys in manually). Defaults are shown; only Google + SMTP need real values.

```ini
# Admin login (replaces the old PIN). Username is `admin`.
ADMIN_USERNAME=admin
ADMIN_PASSWORD=SamanthiM@075

# Google OAuth — Web client ID from Google Cloud Console > Credentials.
# Must match the frontend VITE_GOOGLE_CLIENT_ID.
GOOGLE_CLIENT_ID=

# Email for the password-change PIN. Use a Gmail address + App Password.
# If SMTP_USER / SMTP_PASS are blank, the PIN is logged to the server console.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Bakerya <no-reply@bakerya.local>
```

## Auth API (mounted at `/api/auth`)

| Method | Path                          | Auth    | Body                          | Returns |
|--------|-------------------------------|---------|-------------------------------|---------|
| POST   | `/api/auth/register`          | none    | `{ name, email, password }`   | `{ token, role:'customer', user }` |
| POST   | `/api/auth/login`             | none    | `{ username\|email, password }` | `{ token, role, user? }` |
| POST   | `/api/auth/google`            | none    | `{ credential }` (Google ID token) | `{ token, role:'customer', user }` |
| GET    | `/api/auth/me`                | Bearer  | —                             | `{ user }` |
| POST   | `/api/auth/password/request-pin` | Bearer (customer) | —                | `{ ok:true }` (emails 6-digit PIN) |
| POST   | `/api/auth/password/change`   | Bearer (customer) | `{ pin, newPassword }` | `{ ok:true }` |

- Admin signs in via `/api/auth/login` with username `admin` + `ADMIN_PASSWORD` → admin JWT.
- The old `POST /api/admin/login` (PIN) and `backend/src/routes/admin.js` have been removed.
- Customers are stored in a PocketBase `customers` collection (auto-created on boot).
