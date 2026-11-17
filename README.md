# Karyo Guest Palace

Record-keeping and operations system for Karyo Guest Palace, a hotel with an in-house restaurant. Located after Government Girls College Doma, New Liji, Biu Road, P.O. Box 1050, Gombe, Gombe State.
**Stack:** React + Vite (frontend) · Node + Express (backend) · MySQL · Socket.io.

See [`DESIGN.md`](./DESIGN.md) for the full architecture, database schema, roles, and roadmap.

## Current status

- **Phase 0 — Setup:** done (folders, schema, DB scripts, env templates)
- **Phase 1 — Foundation:** done
  - JWT auth with roles (owner / frontdesk / restaurant / accountant)
  - Owner-only user management
  - Password reset (hashed tokens, no user enumeration)
  - Rate limiting, Helmet, strict CORS
  - Uniform API response shape
  - Frontend shell: login, forgot/reset password, protected routes, layout, dark mode

Rooms, bookings, restaurant/POS, finance, and reporting come in later phases.

## Prerequisites

- Node.js 18+ (18/20/22)
- MySQL 8 (local or hosted)

## Backend setup

```bash
cd backend
copy .env.example .env      # Windows  (macOS/Linux: cp .env.example .env)
# edit .env: set DB_* credentials and a strong JWT_SECRET
npm install
npm run db:setup            # creates the DB and applies schema.sql
npm run db:seed             # seeds settings + a default owner
npm run dev                 # http://localhost:5000
```

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Default seeded owner (unless overridden by env):

```
email:    owner@example.com
password: Owner@1234
```

Change it immediately after first login.

## Frontend setup

```bash
cd frontend
copy .env.example .env      # optional in dev (defaults to localhost:5000)
npm install
npm run dev                 # http://localhost:5173
```

## Environment variables

### backend/.env
| Var | Purpose |
| --- | --- |
| `PORT` | API port (default 5000) |
| `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` | MySQL connection |
| `JWT_SECRET` | **Required.** Long random string |
| `JWT_EXPIRES_IN` | Token lifetime (default `12h`) |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins |
| `APP_URL` | Frontend URL used in password-reset links |
| `SMTP_*`, `MAIL_FROM` | Optional email (reset links, invitations) |
| `BUSINESS_NAME/CURRENCY/CURRENCY_SYMBOL` | Seed defaults |

### frontend/.env
| Var | Purpose |
| --- | --- |
| `VITE_API_URL` | Full API base URL, e.g. `https://hms-api.onrender.com/api` |

## Deployment (free tiers)

1. **Database** — provision MySQL (Railway, Aiven, etc.). Note host/port/user/password/name.
2. **Backend** — deploy `backend/` to Render/Railway. Set all `backend/.env` vars. Run `npm run db:setup` once against the hosted DB (or apply `db/schema.sql` manually).
3. **Frontend** — deploy `frontend/` to Vercel/Netlify. Set `VITE_API_URL` to the deployed API URL. Build command `npm run build`, output `dist`.
4. Set backend `CORS_ORIGIN` to the deployed frontend URL.
5. Schedule **daily database backups**.

## API response shape

```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 0 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

Auth: send the JWT in the `x-auth-token` header (also accepts `Authorization: Bearer`).

## Security notes

- `.env` is git-ignored; only `.env.example` is committed.
- Passwords hashed with bcrypt (cost 10).
- Reset tokens stored hashed (SHA-256), 1-hour expiry.
- Rate limiting on login, forgot-password, and all API routes.
- Socket.io requires a valid JWT handshake.
