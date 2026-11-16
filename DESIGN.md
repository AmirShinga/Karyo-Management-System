# Hotel Management System — Design Document

Record-keeping and operations system for a hotel business that also runs a restaurant.

- **Stack:** React + Vite (frontend), Node + Express (backend), MySQL (database)
- **Hosting:** Free tiers / minimal cost
- **Roles:** Owner/Manager, Front Desk, Restaurant/Cashier, Accountant

---

## 1. Goals

1. Keep accurate daily records of **rooms & bookings**, **restaurant/POS sales**, **income & expenses**, and **staff & payroll**.
2. Give each role only the screens and permissions they need.
3. Produce **revenue reports** (daily/weekly/monthly), **printable receipts/invoices**, **Excel/PDF export**, and **occupancy & sales analytics**.
4. Be deployable online on free tiers at near-zero cost.

## 2. Non-Goals (v1)

- Online booking engine for guests (public web booking) — records are internal first.
- Payment gateway integration (card processing) — record payments manually first.
- Multi-hotel / multi-property support.
- Mobile app (responsive web only in v1).

---

## 3. Roles & Permissions

| Area                | Owner/Manager | Front Desk               | Restaurant/Cashier | Accountant      |
| ------------------- | ------------- | ------------------------ | ------------------ | --------------- |
| Dashboard overview  | full          | limited                  | limited            | financial       |
| Rooms & bookings    | full          | create/edit/check-in/out | view only          | view            |
| Restaurant / POS    | full          | —                        | full               | view            |
| Menu management     | full          | —                        | edit prices/items  | —               |
| Income & expenses   | full          | record payments          | record sales       | full            |
| Staff & payroll     | full          | —                        | —                  | payroll records |
| Reports & analytics | full          | occupancy                | sales              | full financial  |
| User management     | full          | —                        | —                  | —               |
| Settings            | full          | —                        | —                  | —               |

Backend enforces a `roleCheck(...roles)` middleware on every protected route. Frontend hides UI but **backend is the source of truth**.

---

## 4. Architecture

```
┌──────────────────────────┐        HTTPS/JSON        ┌──────────────────────────┐
│  React + Vite (SPA)      │  ───────────────────────▶ │  Node + Express API      │
│  Vercel / Netlify (free) │  ◀─────────────────────── │  Render / Railway (free) │
└──────────────────────────┘        Socket.io (WS)     └────────────┬─────────────┘
                                                                     │ mysql2 pool
                                                                     ▼
                                                        ┌──────────────────────────┐
                                                        │  MySQL (managed/free)    │
                                                        │  Railway / PlanetScale   │
                                                        └──────────────────────────┘
```

- **Frontend:** React 19 + Vite, react-router, axios, Chart.js, plain CSS (dark mode), Context for auth/theme/socket.
- **Backend:** Express, MySQL (mysql2 raw SQL or a light query builder), JWT auth (`x-auth-token` or `Authorization: Bearer`), bcrypt, Zod validation, Socket.io for live updates, PDFKit + ExcelJS for exports.
- **Database:** MySQL, connection pool, real transactions via `pool.getConnection()` for money-affecting operations.

### Key architecture rules (learned from the last project)

1. **Never trust client-computed money.** Prices/totals are always recalculated server-side.
2. **Real DB transactions** for bookings, checkouts, sales, wallet/payments — use a single dedicated connection per transaction.
3. **Authenticate Socket.io handshakes**; never broadcast private financial data globally.
4. **Secrets in env vars only**, `.gitignore` for `.env`, strong JWT secret, rate limiting on auth.
5. **Consistent API response shape** (see §8) so the frontend stops guessing.
6. **Case-exact import paths** (build must work on Linux hosting).

---

## 5. Proposed Folder Structure

```
Hotel Management System/
├─ DESIGN.md
├─ README.md
├─ backend/
│  ├─ server.js
│  ├─ config/db.js                 # mysql2 pool
│  ├─ middleware/auth.js           # JWT verify + roleCheck + rate limiters
│  ├─ validators/                  # Zod schemas per resource
│  ├─ utils/
│  │   ├─ pdf.js                   # receipts/invoices (PDFKit)
│  │   ├─ excel.js                 # exports (ExcelJS)
│  │   └─ mailer.js                # invitations / notifications
│  ├─ routes/                      # thin routers
│  │   ├─ auth.js  rooms.js  bookings.js  restaurant.js  menu.js
│  │   ├─ expenses.js  income.js  staff.js  payroll.js
│  │   ├─ reports.js  settings.js
│  │   └─ controllers/             # one controller per router
│  ├─ db/schema.sql                # full schema
│  ├─ db/seed.sql                  # demo data
│  └─ package.json
└─ frontend/
   ├─ index.html
   ├─ vite.config.js
   ├─ src/
   │   ├─ main.jsx  App.jsx
   │   ├─ api/api.js               # single axios instance
   │   ├─ context/                 # AuthContext, ThemeContext, SocketContext
   │   ├─ components/              # Navbar, Modal, Table, Pagination, Receipt...
   │   ├─ hooks/
   │   └─ pages/
   │       ├─ auth/                # Login, ForgotPassword, ResetPassword
   │       ├─ owner/
   │       ├─ frontdesk/
   │       ├─ restaurant/
   │       └─ accountant/
   └─ package.json
```

---

## 6. Database Schema (MySQL)

> All money columns `DECIMAL(12,2)`. All tables have `created_at`/`updated_at`. Soft-delete via `deleted_at` for financial records (never hard-delete money history).

### users

| column                           | type                                                | notes                    |
| -------------------------------- | --------------------------------------------------- | ------------------------ |
| id                               | INT PK AI                                           |                          |
| name                             | VARCHAR(120)                                        |                          |
| email                            | VARCHAR(160) UNIQUE                                 | login                    |
| phone                            | VARCHAR(30)                                         |                          |
| password                         | VARCHAR(255)                                        | bcrypt                   |
| role                             | ENUM('owner','frontdesk','restaurant','accountant') |                          |
| active                           | TINYINT(1)                                          | disable without deleting |
| reset_token / reset_token_expiry | VARCHAR(255) / DATETIME                             | hashed token             |

### rooms

| column         | type                                       | notes                      |
| -------------- | ------------------------------------------ | -------------------------- |
| id             | INT PK AI                                  |                            |
| room_number    | VARCHAR(20) UNIQUE                         |                            |
| room_type      | VARCHAR(60)                                | e.g. Single, Double, Suite |
| rate_per_night | DECIMAL(12,2)                              | default tariff             |
| capacity       | INT                                        |                            |
| status         | ENUM('available','occupied','maintenance') |                            |
| notes          | TEXT                                       |                            |

### bookings

| column                                                   | type                                                    | notes                |
| -------------------------------------------------------- | ------------------------------------------------------- | -------------------- |
| id                                                       | INT PK AI                                               |                      |
| room_id                                                  | INT FK rooms                                            |                      |
| guest_name / guest_phone / guest_email / guest_id_number | VARCHAR                                                 |                      |
| check_in_date / check_out_date                           | DATE                                                    |                      |
| nights                                                   | INT                                                     | computed server-side |
| rate_per_night                                           | DECIMAL(12,2)                                           | snapshot at booking  |
| total_amount                                             | DECIMAL(12,2)                                           | computed server-side |
| amount_paid                                              | DECIMAL(12,2)                                           |                      |
| status                                                   | ENUM('reserved','checked_in','checked_out','cancelled') |                      |
| created_by                                               | INT FK users                                            |                      |
| actual_check_in / actual_check_out                       | DATETIME                                                |                      |

### restaurant_menu_items

| column                                                                                    | notes |
| ----------------------------------------------------------------------------------------- | ----- |
| id, name, category, price DECIMAL(12,2), cost DECIMAL(12,2), available TINYINT, image_url |

### restaurant_orders

| column                                                                                                                                                                   | notes |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| id, order_type ENUM('dine_in','takeaway','room_service'), room_id NULL FK, table_number NULL, total DECIMAL, status ENUM('open','paid','cancelled'), created_by, paid_at |

### restaurant_order_items

| column                                                                       | notes |
| ---------------------------------------------------------------------------- | ----- |
| id, order_id FK, menu_item_id FK, quantity, price_at_time DECIMAL (snapshot) |

### inventory (raw materials / supplies)

| column                                                                         | notes |
| ------------------------------------------------------------------------------ | ----- |
| id, name, unit, quantity DECIMAL, reorder_level, unit_cost DECIMAL, updated_at |

### expenses

| column                                                                                                  | notes |
| ------------------------------------------------------------------------------------------------------- | ----- |
| id, category VARCHAR, description, amount DECIMAL, expense_date DATE, recorded_by FK users, receipt_url |

### income

> Unified ledger for non-restaurant income (room payments, etc.). Restaurant sales captured via orders.
> | column | notes |
> |---|---|
> | id, source ENUM('room','restaurant','other'), reference_id (booking_id/order_id), description, amount DECIMAL, income_date DATE, recorded_by |

### staff

| column                                                                             | notes |
| ---------------------------------------------------------------------------------- | ----- |
| id, user_id NULL FK, full_name, position, phone, salary DECIMAL, hire_date, active |

### payroll

| column                                                                                                                                                   | notes |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| id, staff_id FK, period_start DATE, period_end DATE, gross DECIMAL, deductions DECIMAL, net DECIMAL, status ENUM('pending','paid'), paid_at, recorded_by |

### settings (key/value)

business name, currency, tax rate, receipt header/footer, delivery/service charge, etc.

**Indexes:** `bookings(room_id, check_in_date, check_out_date)`, `restaurant_orders(created_at, status)`, `expenses(expense_date)`, `income(income_date)`, `payroll(staff_id, period_start)`.

---

## 7. Core Business Logic (server-side only)

- **Booking:** validate room availability (no overlapping `reserved`/`checked_in` bookings) inside a transaction; compute `nights` and `total_amount` from dates + rate; never trust client totals.
- **Check-in/out:** status transitions update `rooms.status`; checkout finalizes balance and writes an `income` row.
- **Restaurant order:** recompute each line from `restaurant_menu_items.price` and store `price_at_time`; write `income` source `restaurant` on payment.
- **Expenses:** append entries; never edit money history — use reversal entries.
- **Payroll:** generate from `staff.salary` per period; mark `paid` writes an `expenses` row (category Payroll).
- **Reports:** aggregate by `DATE()` buckets in SQL (use DB timezone consistently — avoid the UTC/local off-by-one bug from the prior project).

---

## 8. API Surface (v1)

Uniform response shape:

```json
{ "success": true, "data": ..., "meta": { "page": 1, "limit": 20, "total": 153 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

| Group      | Base              | Endpoints (examples)                                                              |
| ---------- | ----------------- | --------------------------------------------------------------------------------- |
| Auth       | `/api/auth`       | login, refresh/logout, change-password, forgot/reset-password, users CRUD (owner) |
| Rooms      | `/api/rooms`      | GET list, POST, PUT, PATCH status, DELETE(soft)                                   |
| Bookings   | `/api/bookings`   | GET list/filter, POST create, PATCH check-in/out/cancel, GET availability         |
| Restaurant | `/api/restaurant` | menu CRUD, orders create/list/pay/cancel, tab by room                             |
| Inventory  | `/api/inventory`  | list, adjust stock, low-stock list                                                |
| Income     | `/api/income`     | list/filter, create, summary                                                      |
| Expenses   | `/api/expenses`   | list/filter, create, summary                                                      |
| Staff      | `/api/staff`      | CRUD, link to user account                                                        |
| Payroll    | `/api/payroll`    | generate period, list, mark paid                                                  |
| Reports    | `/api/reports`    | dashboard, revenue (day/week/month), occupancy, sales, export (xlsx/pdf)          |
| Receipts   | `/api/receipts`   | GET `/booking/:id.pdf`, GET `/order/:id.pdf`                                      |
| Settings   | `/api/settings`   | get/update business settings                                                      |

**Socket.io events (authenticated rooms only):** `booking:updated`, `order:created`, `order:paid`, `room:status`, `dashboard:refresh`.

---

## 9. Reporting & Exports

- **Dashboards:** revenue (today/week/month), occupancy %, restaurant sales, top items, expenses, profit.
- **Charts:** Chart.js line/bar (revenue over time, occupancy over time, top items).
- **Receipts/Invoices:** PDFKit server-side, branded PDF (hotel name, dates, line items, totals, tax). Downloadable from booking/order screens.
- **Exports:** ExcelJS for ledger exports (income, expenses, sales, payroll), with date-range filters.

---

## 10. Security Checklist (v1)

- [ ] `.env` files git-ignored; only `.env.example` committed
- [ ] Strong random `JWT_SECRET`; short-lived access tokens (consider refresh tokens)
- [ ] `express-rate-limit` on `/auth/login`, `/auth/forgot-password`, and any PIN/verify endpoints
- [ ] `helmet` security headers; strict CORS allowlist (explicit production origin)
- [ ] Server-side validation (Zod) on **every** mutating route, and server-side price computation
- [ ] bcrypt password hashing (cost ≥ 10); no plaintext fallbacks
- [ ] Reset tokens hashed in DB with short expiry; no user enumeration in responses
- [ ] Auth on Socket.io handshake; private financial data only in per-user rooms
- [ ] Parameterized SQL everywhere (no string concatenation)
- [ ] Uploads: validate MIME + re-encode images; store outside web root or serve carefully
- [ ] Don't log secrets/PII/reset URLs to console in production

---

## 11. Hosting Plan (free / minimal cost)

| Layer             | Option A (recommended)                           | Option B                         |
| ----------------- | ------------------------------------------------ | -------------------------------- |
| Frontend          | **Vercel** or **Netlify** (free)                 | Cloudflare Pages                 |
| Backend API       | **Render** free web service or **Railway** trial | Fly.io                           |
| MySQL             | **Railway** MySQL plugin / **Aiven** free        | PlanetScale (if still free tier) |
| Domain (optional) | Namecheap/Cloudflare (~$10/yr)                   | —                                |
| Files/backups     | Cloudinary free (images)                         | Backblaze B2                     |

**Deployment notes**

- Frontend build: `npm run build` → static; set `VITE_API_URL` to the deployed API URL (single env var; **no hardcoded ports/hosts**).
- Backend: env vars `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME`, `JWT_SECRET`, `CORS_ORIGIN`, SMTP creds; run `schema.sql` migration on first deploy.
- Render free services sleep when idle (cold starts) — acceptable for a small business; upgrade later if needed.
- Schedule **daily DB backups** (cron or provider feature) — critical for financial records.

---

## 12. Build Roadmap (phased)

**Phase 0 — Setup**

- Create folders, `package.json`s, DB schema, migration/seed script, `.env.example`, `.gitignore`, README.

**Phase 1 — Foundation**

- Auth (login, roles, JWT, rate limiting), user management, settings, consistent response shape, frontend shell (login + layout + route guards).

**Phase 2 — Rooms & Bookings**

- Rooms CRUD, bookings with availability + transactions, check-in/out, occupancy status.

**Phase 3 — Restaurant/POS**

- Menu management, orders (dine-in/takeaway/room service), payment, tab-to-room.

**Phase 4 — Finance**

- Income ledger, expenses, staff, payroll, inventory.

**Phase 5 — Reporting**

- Dashboards, revenue/occupancy/sales reports, PDF receipts, Excel exports.

**Phase 6 — Realtime & Polish**

- Authenticated Socket.io live updates, loading/empty states, theming, error boundaries.

**Phase 7 — Deploy**

- Deploy DB → backend → frontend; env vars; smoke test; backups.

---

## 13. Confirmed Decisions

1. **Currency:** ₦ (Naira). Tax field included but defaults to 0% (no VAT); configurable in settings.
2. **Room-service orders:** paid immediately (no city-ledger / tab-to-room in v1).
3. **Guests:** entered per booking (no reusable guest profiles).
4. **Payments:** pay-as-you-go (no guest wallet or deposits).
5. **Branches:** single branch for now; multi-branch deferred.
6. **Receipt numbering:** `REC-YYYY-NNNN` (e.g. `REC-2026-0001`).

### Implications for the build
- `restaurant_orders` always require immediate payment; drop the `room_service`-unpaid flow. `status` transitions `open → paid` happen at creation.
- No `guest_wallets` / deposits tables. No `city_ledger`.
- `income.reference_id` still links bookings/orders for the ledger.
- Receipt numbers generated server-side from a per-year counter (atomic increment to avoid duplicates).
