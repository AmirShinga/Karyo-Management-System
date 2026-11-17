# HMS — Progress & Handoff Notes

_Last updated: 2026-11-15_

## Improvements rollout (items 2, 5, 8, 10, 11)

Backend for all five items is complete and verified (server boots, `/api/health` 200,
`node --check` clean on all changed files). Frontend is complete and verified
(`npm run lint` + `npm run build` clean).

- **Item 2 — Financial audit logging:** _(later removed — see below)_ `audit_logs`
  table, audit middleware/utils and all `audit()` calls were deleted; only
  `receipt_snapshots` (used for re-downloading receipts) is retained.
- **Item 5 — Auth hardening:** short-lived access tokens + rotating refresh tokens
  (httpOnly cookie `hms_refresh`, path `/api/auth`), lockout, TOTP MFA (`utils/totp.js`,
  no new deps), `sessions` table + revocation (`utils/sessions.js`), change password,
  forgot/reset. Frontend: `api.js` single-flight refresh + queue, MFA login step,
  `Security.jsx` (password change only; the two-step verification and active-session
  cards were later removed, though the `/auth/mfa/*` and `/auth/sessions` endpoints
  and login MFA remain).
- **Item 8 — Pagination + search:** uniform `{ page, limit, total, pages }` meta and
  `search` on list endpoints. Frontend uses `usePagedResource` + `Pagination`/`SearchInput`
  + `TableSkeleton` on Staff, Income, Expenses, Menu, Complaints, Rooms, Users, Bookings, Orders.
- **Item 10 — Resilience/UX:** `ErrorBoundary`, focus trap hook, debounced search,
  double-submit guards, `role="alert"`/`role="status"` on notices, skeleton loaders,
  responsive tables.
- **Item 11 — Operational modules:** maintenance, inventory (stock deltas), and room status
  history (`GET /api/rooms/:id/history`), plus matching frontend pages and nav groups.
  (Housekeeping, Rates & Taxes, Night Audit and Shift Handover were later removed.)

Roles are `admin` · `owner` · `hotel` · `restaurant` · `staff` (`admin` bypasses all checks).

### Removed modules

- Housekeeping, Rates & Taxes, Night Audit, Shift Handover (full stack).
- Audit Trail — removed entirely: `frontend/src/pages/AuditTrail.jsx`, its route/nav,
  `backend/routes/audit.js` + `auditController.js`, `middleware/audit.js`, `utils/audit.js`,
  every `audit()` call, the `audit_logs` table and the `audit.view` permission.
- Security page: the Two-step verification and Active sessions cards were removed;
  the backend MFA (`/auth/mfa/*`) and session (`/auth/sessions`) endpoints remain.
- Expense payment method — removed full stack: the `payment_method` column and
  `expense_payment_splits` table (schema + migration drops them), the `payments` fields
  in the expense validators, controller payment logic, the expense export column, and the
  payment fields/column on the Expenses page. Income/booking/order payments are unaffected.

### Password management

- Every user changes **their own** password from the Security page (`POST /api/auth/change-password`).
- `PATCH /api/auth/users/:id/password` lets a privileged role set **any** account's password
  (new permission `users.password`, admin-only by default but assignable on the Permissions page).
  The target's sessions are revoked. Password is required when creating a user (`users.manage`).
- `db/migrate.js` now prunes permission codes no longer in the catalog, so removed modules
  (Housekeeping, Rates & Taxes, Night Audit, Shift Handover) no longer appear on the Permissions page.

### User management

- The Users page has a **Delete** button (per user, gated by `users.manage`) next to
  Enable/Disable. It calls `DELETE /api/auth/users/:id`, which soft-deletes the account
  (`deleted_at`, `active = 0`) and revokes its sessions. Your own row has no Delete button,
  and the server rejects self-deletion.
- The `users.manage` permission label now reads "Create / edit / disable / delete users".

### Restaurant POS charges

- The POS shows a **Room service charge** input for room-service orders and a
  **Takeaway charge** input for takeaway orders (manual amount per order; hidden for dine-in).
- Stored in `restaurant_orders.charge_amount`; added to the order total server-side
  (`total = subtotal + tax + charge`). Shown in the POS total, the order detail drawer and
  the printed receipt.

### Payment entry

- `PaymentSplitFields` (used by POS, Income, Orders, Outstanding, Bookings) shows a
  **Full payment** checkbox above the amount input whenever an expected total is known;
  ticking it fills the full amount, unticking clears it.
- In Bookings, the Record payment and Checkout drawers now start with an empty amount
  (no auto-fill of the balance) so the **Full payment** checkbox is what fills it.

### Menu display order

- `menu_items.sort_order` (`INT DEFAULT 0`) lets the Menu page set a **POS order** value
  per item; the menu list (and therefore the POS grid) is sorted by `sort_order`, then
  category, then name — so the number controls the POS arrangement.

### Food categories

- New **Categories** page (`/categories`, `categories.view`) backed by a `menu_categories`
  table (name + sort order). CRUD is `/api/menu-categories`; renaming a category cascades
  to `menu_items.category`, and deleting is blocked while items use it. The migration
  backfills the distinct existing `menu_items.category` values.
- The Menu **Add/Edit item** form picks the category from a dropdown of registered
  categories (with a link to the Categories page when none exist).
- The POS menu shows category tabs (All + each category that has available items) to
  filter the meal grid client-side.
- Permissions `categories.view/create/update/delete` (Restaurant module) default to:
  owner `create/update/delete`, restaurant all four, staff `view`.

## What this is

Karyo Guest Palace for a hotel with an in-house restaurant.
**Stack:** React 19 + Vite 7 (frontend) · Node + Express 5 + MySQL (mysql2, raw SQL, no ORM) + Socket.io (backend) · JWT + bcrypt · Zod · Nodemailer · PDFKit · ExcelJS.

Full architecture, schema, roles and decisions live in [`DESIGN.md`](./DESIGN.md).
Setup/deploy instructions live in [`README.md`](./README.md).

## Status: feature-complete (Phases 0–5 done, locally verified)

- **Phase 0 — Setup:** done (folders, `db/schema.sql`, `db/setup.js`, `db/seed.js`, env templates)
- **Phase 1 — Foundation:** done (auth + roles, user management, password reset, rate limiting, Helmet, CORS, uniform responses, frontend shell)
- **Phase 2 — Rooms & Bookings:** done (availability, create w/ transaction + `FOR UPDATE`, check-in/out/cancel, server-side pricing)
- **Phase 3 — Restaurant / POS:** done (menu management, POS, orders, atomic receipts `REC-YYYY-NNNN`, cancel writes reversal income)
- **Phase 4 — Finance:** done (income ledger, expenses, inventory w/ low-stock, staff, payroll → paid records a Payroll expense in the same transaction)
- **Phase 5 — Reporting:** done (dashboard, revenue series, revenue-by-source, occupancy, top-selling items, xlsx exports, PDF booking/order receipts)

_Next up (not started): deployment to free tiers._

## Roles

`owner` · `frontdesk` · `restaurant` · `accountant`

## How to run (local)

```powershell
# Terminal 1 — backend
cd backend
npm run dev            # http://localhost:5000  (wait for "Server listening on port 5000")

# Terminal 2 — frontend
cd frontend
npm run dev            # http://localhost:5173
```

Reset DB if needed:

```powershell
cd backend
npm run db:setup
npm run db:seed
```

### Test logins
- Owner: `owner@example.com` / `Owner@1234`
- Front desk: `desk@example.com` / `Desk@1234`

## Key conventions

- API base (dev): `http://localhost:5000/api`. Auth header: `x-auth-token` (also accepts `Authorization: Bearer`).
- Response shape: `{ success, data, meta? }` / `{ success, error: { code, message } }`.
- All money is recomputed server-side; real DB transactions via `withTransaction()`.
- Receipts: `REC-YYYY-NNNN` via atomic `receipt_counters` upsert.
- Secrets never committed — only `.env.example` is tracked; `.env` is git-ignored.
- Import paths are exact-case (Linux-safe). Single env-driven API base URL.

## Verification done

- Backend: `node --check` across all `.js` files — parse clean.
- Frontend: `npm run lint` clean, `npm run build` clean (~148 modules).
- E2E Node-fetch smoke tests per phase (auth, rooms/bookings, restaurant/orders, finance, reports/exports/receipts) — all passing.

## Notable fixes / gotchas

- `utils/pdf.js` uses `require('../config/db')` (utils is one level deep, not two like `routes/controllers/`).
- Report daily series are grouped by SQL `DATE()` to avoid JS timezone off-by-one.
- Bookings/orders are cancelled via `PATCH /:id/cancel` (no DELETE route).

## Suggested next steps

1. **Deploy** — DB (Railway/Aiven MySQL), backend (Render/Railway), frontend (Vercel/Netlify). Set `VITE_API_URL` + backend `CORS_ORIGIN`; run `db:setup` against hosted DB once.
2. Schedule daily DB backups.
3. Optional: change the seeded owner password; configure `SMTP_*` for password-reset emails.
