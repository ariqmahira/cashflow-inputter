# Cashflow Inputter

Mobile-first PWA for logging daily expenses & income into a Google Sheets workbook (the existing `Cashflow Bab & Bi` layout — monthly sheets, expense columns `H..L`, income columns `N..Q`, SUM totals in row 30).

- **Stack:** Vite + React + TypeScript + Tailwind, Google Identity Services (browser OAuth), Google Sheets API v4, vite-plugin-pwa.
- **Hosting:** Deploy to Vercel/Netlify (free). Install on iOS/Android via "Add to Home Screen".
- **No backend.** Access token lives only in browser memory.

---

## 1. One-time Google Cloud setup

1. Open <https://console.cloud.google.com/>, create a project (or reuse one).
2. **Enable the API:** APIs & Services → Library → search "Google Sheets API" → Enable.
3. **OAuth consent screen:** APIs & Services → OAuth consent screen.
   - User type: **External** (or Internal if you have Workspace).
   - App name: "Cashflow Inputter". Add your email as developer contact.
   - **Scopes:** add `.../auth/spreadsheets`.
   - **Test users:** add every Google account that will use the app (yourself + partner). Until you publish the app, only these accounts can sign in.
4. **OAuth Client ID:** APIs & Services → Credentials → Create Credentials → **OAuth client ID** → Application type **Web application**.
   - Authorized JavaScript origins:
     - `http://localhost:5173` (dev)
     - your production URL (e.g. `https://cashflow-inputter.vercel.app`)
   - Copy the **Client ID** — you'll paste it into `.env` next.

## 2. Upload the workbook to Google Drive

Upload `Cashflow Bab & Bi.xlsx` to Google Drive → right-click → **Open with → Google Sheets**. Drive saves a converted Google Sheets copy. The URL contains the spreadsheet ID:

```
https://docs.google.com/spreadsheets/d/<THIS_IS_THE_SPREADSHEET_ID>/edit
```

Share that file with every Google account in the test-users list above (Editor permission).

## 3. Configure the app

Create a `.env` file at the project root:

```bash
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_SPREADSHEET_ID=the-spreadsheet-id-from-the-url
```

The spreadsheet ID is also editable from inside the app (Settings tab) and persists in `localStorage`, so each user can confirm or change it after first sign-in.

## 4. Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Sign in with one of the test-user Google accounts. Add an entry, then open the Google Sheet in another tab — it should land in `H{first-empty}:L{...}` (expenses) or `N..Q` (income) of the current month sheet, with row 30 SUM auto-updating.

If the current month sheet doesn't exist yet, the app duplicates the most recent existing monthly sheet as a template, renames it (e.g. "Mei 2026"), and clears the data cells.

## 5. Deploy to Vercel

```bash
# install Vercel CLI once
npm i -g vercel
vercel               # follow prompts, accept defaults
vercel --prod        # promote to production
```

Or use the Vercel web UI: import the GitHub repo, set the two `VITE_*` env vars in Project Settings → Environment Variables, and deploy.

After deploy, **go back to Google Cloud → Credentials → your OAuth client** and add the production URL to **Authorized JavaScript origins**.

## 6. Install on phone

- **iOS Safari:** open the production URL → Share → **Add to Home Screen**.
- **Android Chrome:** open the URL → menu → **Install app** (or "Add to Home Screen").

The app launches standalone (no browser chrome) and behaves like a native app.

---

## Architecture notes

- Each month is its own sheet (e.g. `Mei 2026`). Data rows: **5..29**. Row 30 = SUM totals (never touched by the app).
- Append = write to the first empty row in the data range.
- Delete = clear the row (gaps stay; never shifts other rows, preserves row 30 SUM range).
- Dates are written as Sheets serial numbers so they remain real dates (sortable, formula-friendly), not strings.
- Auth scope: `https://www.googleapis.com/auth/spreadsheets` only.
- Access token lifetime: ~1 hour. Sign in again if it expires. No refresh token (would require a backend).

## Limits

- Max 25 entries per side per month (expense and income each). Existing workbook layout caps this at row 29 with totals at row 30. If you hit the cap, the app shows an error; expand the sheet manually (insert rows above row 30 and re-point the SUM).
- Concurrent two-user writes might collide if both grab the same empty row in the same second. Vanishingly rare in practice for personal use.

## Project layout

```
src/
  auth/           Google Identity Services token client
  sheets/         Sheets API wrapper, month-sheet management, entries CRUD
  features/
    AddEntry/     Expense + Income tabs
    RecentEntries/ list, edit, delete
    Totals/       month totals (reads row 30 SUM)
    Settings/     spreadsheet ID, income categories, sign out
  components/     Button, Input, Select, BottomNav
config.ts         constants (categories, column ranges, month names)
```

## Regenerate icons

```bash
node scripts/make-icons.mjs
```
