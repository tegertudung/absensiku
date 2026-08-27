# 📚 Absensiku — Sistem Absensi Pioner Class

Aplikasi manajemen absensi & honor untuk lembaga bimbingan belajar Pioneer Class:
jadwal kelas reguler & privat, presensi siswa, validasi sesi mengajar, kuota paket
privat, dan rekap honor tentor — untuk dua peran, **Admin** dan **Tentor**.

**Tech Stack:** Next.js 14 (App Router) · Express + TypeScript · PostgreSQL + Prisma · PWA
**Status:** Semua 12 modul fungsional dari dokumen requirement sudah diimplementasi dan diuji.

---

## 📋 Daftar Isi

1. [Fitur yang sudah dibangun](#-fitur-yang-sudah-dibangun)
2. [Tech stack & alasan pemilihan](#-tech-stack--alasan-pemilihan)
3. [Struktur folder](#-struktur-folder)
4. [Prasyarat](#-prasyarat)
5. [Instalasi dari nol](#-instalasi-dari-nol)
6. [Environment variables](#-environment-variables)
7. [Akun login](#-akun-login)
8. [Perintah sehari-hari](#-perintah-sehari-hari)
9. [Skema database](#-skema-database)
10. [Desain UI & sistem warna](#-desain-ui--sistem-warna)
11. [PWA (Progressive Web App)](#-pwa-progressive-web-app)
12. [Push Notification](#-push-notification)
13. [Deploy (coba-coba online)](#-deploy-coba-coba-online)
14. [Troubleshooting](#-troubleshooting)
15. [Keputusan & batasan yang disengaja](#-keputusan--batasan-yang-disengaja)

---

## ✅ Fitur yang sudah dibangun

| # | Modul | Ringkasan |
|---|-------|-----------|
| 1 | **Auth & RBAC** | Login JWT, dua peran (`ADMIN`, `TENTOR`), route dan API dijaga per-role + ownership check |
| 2 | **Manajemen Tentor** | CRUD profil tentor, aktif/nonaktif, daftar jadwal & histori mengajar per tentor |
| 3 | **Manajemen Siswa** | CRUD profil siswa, status (Aktif/Nonaktif/Lulus), halaman detail (kelas diikuti + histori sesi) |
| 4 | **Kelas & Mata Pelajaran** | Kelas reguler, enrollment siswa ke kelas, master mata pelajaran |
| 5 | **Jadwal** | Jadwal reguler & privat mingguan, **deteksi kelas bentrok otomatis** (overlap waktu per tentor), notifikasi ke tentor saat jadwal dibuat/diubah/bentrok |
| 6 | **Sesi Mengajar** | Mulai sesi → isi absensi (kelas reguler) → selesaikan sesi, dengan snapshot tarif honor saat itu (`honorRateSnapshot`, immutable meski tarif master berubah kemudian) |
| 7 | **Auto-lock sesi telat** | Cron job per jam (`node-cron`) mengunci sesi yang belum diselesaikan >3 hari → status `PENDING_ADMIN` untuk divalidasi |
| 8 | **Validasi Admin** | Admin menyetujui/menolak sesi bermasalah (pembatalan, keterlambatan, dll), dengan audit trail |
| 9 | **Paket Privat** | Kuota sesi privat per siswa (ledger transaksi bertanda: pemakaian mengurangi, perpanjangan menambah), cegah siswa punya 2 paket aktif sekaligus |
| 10 | **Rekap & Ekspor** | Rekap mengajar per tentor/kelas/hari/jam, total honor, ekspor Excel (`.xlsx`) |
| 11 | **Master Honor** | Tarif honor per jenis sesi, riwayat perubahan tarif (tidak memengaruhi sesi yang sudah lewat) |
| 12 | **Audit Log** | Semua perubahan status/keputusan penting tercatat (siapa, kapan, nilai lama→baru) |
| + | **Tentor buat jadwal privat sendiri** | Tentor bisa menambah jadwal privat untuk siswanya sendiri, dengan **cek bentrok inline sebelum simpan** (`/tentor/private/new`) |
| + | **PWA** | Installable di HP/desktop, service worker, halaman offline fallback |
| + | **Push notification** | Notifikasi jadwal/bentrok terkirim sebagai push asli (VAPID) ke HP/desktop, tetap muncul walau app tertutup — lihat [Push Notification](#-push-notification) |
| + | **Desain navy Pioneer Class** | Palet warna & ikon disamakan dengan mockup resmi di dokumen requirement (lihat [Desain UI](#-desain-ui--sistem-warna)) |

---

## 🧱 Tech stack & alasan pemilihan

| Layer | Pilihan | Kenapa |
|-------|---------|--------|
| Frontend | **Next.js 14 (App Router)** + React 18 + TypeScript | Satu framework untuk web admin (desktop) dan tampilan tentor (mobile-responsive), SSR/CSR fleksibel |
| Styling | **Tailwind CSS** | Cepat untuk UI konsisten, mudah di-custom (lihat `tailwind.config.js` untuk palet navy) |
| State | **Zustand** | Ringan untuk auth state, tanpa boilerplate Redux |
| Backend | **Express + TypeScript** | Sederhana, eksplisit, mudah di-reason untuk logika bisnis transaksional |
| ORM & DB | **Prisma + PostgreSQL** | Migrasi terstruktur, relasi eksplisit, transaksi atomik (`prisma.$transaction`) untuk operasi kritis (selesaikan sesi + potong kuota + snapshot honor) |
| Auth | **JWT + bcryptjs** | `bcryptjs` (bukan `bcrypt`) dipilih karena `bcrypt` butuh native build tools yang sering bermasalah di Windows |
| Job terjadwal | **node-cron** | Cukup untuk kebutuhan 1 job per jam (auto-lock sesi telat); tidak perlu infrastruktur queue terpisah (BullMQ/Redis) |
| Ekspor laporan | **ExcelJS** | Generate file `.xlsx` langsung dari data rekap |
| Validasi input | **Zod** | Dipakai konsisten di backend (schema request) dan `packages/shared` |
| Monorepo | **pnpm workspaces** | Satu repo untuk `backend`, `frontend`, `shared`, instal sekali dari root |

---

## 📁 Struktur folder

```
absensiku/
├── .env                            # Kredensial DB & config bersama (gitignored)
├── start.bat / stop.bat            # Jalankan/matikan backend+frontend sekaligus (Windows)
├── package.json                    # Root workspace scripts
├── pnpm-workspace.yaml
│
├── apps/
│   ├── backend/                    # Express API
│   │   ├── src/
│   │   │   ├── index.ts            # Entry point
│   │   │   ├── api/                # Route per modul (auth, tutors, students, schedules, sessions, ...)
│   │   │   ├── services/           # Logika bisnis (transaksi, snapshot, deteksi bentrok, dll)
│   │   │   ├── middleware/         # requireAuth, requireRole, ownership check
│   │   │   ├── jobs/                # node-cron: lockOverdueSessions
│   │   │   └── utils/               # prisma client, error handler, audit log helper
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # 16 model
│   │   │   ├── migrations/         # 5 migration
│   │   │   ├── seed.ts             # Data contoh (kelas, tentor, siswa dummy)
│   │   │   └── .env                # DATABASE_URL (gitignored)
│   │   └── .env.example            # Template — aman di-commit
│   │
│   └── frontend/                   # Next.js App Router
│       ├── src/
│       │   ├── app/
│       │   │   ├── login/
│       │   │   ├── admin/          # 9 halaman (dashboard, tutors, students, classes, schedules, validations, recap, honor-rates, audit-log)
│       │   │   └── tentor/         # Beranda, Jadwal, Rekap, Profil, Tambah Privat
│       │   ├── components/         # icons.tsx, StatusBadge.tsx, NotificationBell, dll
│       │   ├── lib/                # api.ts (axios client), format.ts
│       │   └── store/               # authStore (Zustand)
│       ├── public/                 # manifest.json, service-worker.js, ikon PWA
│       ├── tailwind.config.js      # Palet warna "navy" (lihat bagian Desain UI)
│       └── .env.local              # NEXT_PUBLIC_API_URL, dll (gitignored)
│
└── packages/
    └── shared/                     # Types, Zod validators, constants dipakai frontend+backend
```

---

## 🔧 Prasyarat

```bash
node --version       # v18+ (dikembangkan & diuji di v22)
pnpm --version        # v8+
psql --version        # PostgreSQL v14+ (server harus sudah running)
```

Instal pnpm kalau belum ada:
```bash
npm install -g pnpm
```

---

## 🚀 Instalasi dari nol

### 1. Clone & install dependencies
```bash
git clone <url-repo-ini>
cd absensiku
pnpm install
```

### 2. Siapkan database PostgreSQL
Buat database kosong (nama bebas, contoh `db_absensiku`):
```bash
psql -U postgres -c "CREATE DATABASE db_absensiku;"
```

### 3. Buat file environment
Salin template lalu isi kredensial database & JWT secret milikmu sendiri:
```bash
cp apps/backend/.env.example apps/backend/prisma/.env
```
Edit `apps/backend/prisma/.env`, minimal isi `DATABASE_URL`. Lihat detail lengkap
tiap variabel di [Environment Variables](#-environment-variables) — termasuk
**peringatan penting soal password yang mengandung karakter `@`**.

Buat juga `apps/frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### 4. Jalankan migrasi & isi data contoh
```bash
cd apps/backend
npx prisma migrate deploy   # terapkan 5 migration yang sudah ada
npx prisma db seed          # isi kelas/tentor/siswa contoh (lihat prisma/seed.ts)
cd ../..
```

### 5. Buat akun Admin pertama
Belum ada admin default — buat sendiri lewat endpoint bootstrap (`/auth/register`
menerima role `ADMIN` secara terbuka sampai admin pertama dibuat, lalu sebaiknya
dikunci ulang):
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pionerclass.com","password":"admin123","role":"ADMIN"}'
```
*(Jalankan backend dulu — lihat langkah 6 — sebelum memanggil endpoint ini.)*

### 6. Jalankan aplikasi

**Windows — cara termudah:**
```bash
start.bat
```
Ini membuka dua jendela terminal (backend port 3001, frontend port 3000) sekaligus.
Gunakan `stop.bat` untuk mematikan keduanya.

**Manual (semua OS), dari root:**
```bash
pnpm dev
```

Buka [http://localhost:3000](http://localhost:3000) — login dengan akun admin yang
dibuat di langkah 5, atau akun tentor contoh dari seed (lihat [Akun Login](#-akun-login)).

---

## 🔑 Environment variables

### `apps/backend/prisma/.env` (wajib, gitignored)
| Variabel | Contoh | Keterangan |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:pass@localhost:5432/db_absensiku` | ⚠️ Kalau password mengandung `@`, harus di-URL-encode jadi `%40` — lihat [Troubleshooting](#-troubleshooting) |
| `JWT_SECRET` | string acak panjang | Ganti dengan nilai unik per environment, jangan pakai contoh di `.env.example` |
| `JWT_EXPIRES_IN` | `7d` | Masa berlaku token login |
| `PORT` | `3001` | Port backend |
| `NODE_ENV` | `development` | |

| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | — | Untuk Web Push (notifikasi ke HP walau app tertutup). Generate pasangan sendiri per environment: `node -e "console.log(require('web-push').generateVAPIDKeys())"`. Tanpa ini, push dilewati diam-diam — bel notifikasi in-app tetap jalan normal |
| `VAPID_SUBJECT` | `mailto:admin@pionerclass.com` | Kontak yang disertakan ke push service (syarat protokol VAPID) |

### `apps/frontend/.env.local` (wajib, gitignored)
| Variabel | Contoh | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | Base URL yang dipanggil axios client frontend |

> Public key VAPID **tidak perlu** disalin ke `.env.local` — frontend
> mengambilnya sendiri lewat `GET /api/push/public-key` supaya tidak pernah beda
> dengan yang di backend.

> **Catatan:** `REDIS_URL` yang sempat ada di draf `.env` awal **tidak dipakai** —
> job terjadwal (auto-lock sesi telat) memakai `node-cron` in-process, tidak
> butuh Redis/queue terpisah. Aman diabaikan/dihapus.

Kredensial nyata **tidak pernah** disimpan di README atau di-commit ke git — cek
`.gitignore` (pola `.env`, `.env.local`, `.env.*.local` berlaku rekursif ke semua
folder, termasuk `apps/backend/prisma/.env`).

---

## 👤 Akun login

| Role | Email | Password | Sumber |
|---|---|---|---|
| Admin | `admin@pionerclass.com` | `admin123` | Dibuat manual lewat `/auth/register` (langkah 5 instalasi) |
| Tentor | `tentor1@pionerclass.com` | `tentor123` | Otomatis dari `npx prisma db seed` |

Ganti password ini sebelum deploy ke lingkungan yang bukan development lokal.

---

## 🛠️ Perintah sehari-hari

```bash
# Jalankan backend + frontend bareng (dari root)
pnpm dev

# Jalankan salah satu saja
pnpm backend
pnpm frontend

# Type-check semua package
pnpm type-check

# Build production
pnpm build
```

### Database (dari `apps/backend/`)
```bash
npx prisma migrate dev --name <nama_perubahan>   # buat migration baru setelah ubah schema.prisma
npx prisma migrate deploy                          # terapkan migration yang sudah ada (fresh install)
npx prisma db seed                                  # isi ulang data contoh
npx prisma studio                                    # GUI untuk lihat/edit data langsung
```

---

## 🗄️ Skema database

16 model di `apps/backend/prisma/schema.prisma`, diterapkan lewat 5 migration:

1. `User` — akun login (email, password hash, role)
2. `Tutor` — profil tentor
3. `Student` — profil siswa
4. `Subject` — mata pelajaran
5. `Class` — kelas reguler
6. `ClassEnrollment` — relasi siswa ↔ kelas reguler
7. `Schedule` — jadwal mingguan (reguler & privat), dengan deteksi bentrok
8. **`TeachingSession`** ⭐ — data inti tiap sesi mengajar, menyimpan `honorRateSnapshot` (immutable)
9. `AttendanceRecord` — presensi siswa per sesi reguler
10. **`PrivatePackage`** ⭐ — kuota sesi privat per siswa (`quotaTotal`/`quotaUsed`/`quotaRemaining`)
11. **`PrivatePackageUsage`** ⭐ — ledger transaksi kuota (positif = terpakai, negatif = penambahan/perpanjangan)
12. `HonorRate` — tarif honor aktif per jenis sesi
13. `HonorRateHistory` — riwayat perubahan tarif
14. `SessionValidation` — kasus yang perlu persetujuan admin (telat, dibatalkan, dll)
15. `AuditLog` — jejak perubahan (tabel, record, nilai lama→baru, siapa, kapan)
16. `Notification` — notifikasi ke tentor (jadwal baru/berubah/bentrok)

---

## 🎨 Desain UI & sistem warna

Palet dan gaya ikon diambil langsung dari mockup resmi di dokumen requirement
(disampel piksel dari gambar mockup, bukan tebakan):

| Token | Hex | Dipakai untuk |
|---|---|---|
| `navy-900` | `#001936` | Sidebar admin, header navy |
| `navy-800` | `#002145` | Menu sidebar aktif |
| `navy-700` | `#002953` | Badge "Privat", tombol sekunder |
| Hijau | `bg-green-100` | Status "Selesai" |
| Amber | `bg-amber-100` | Status "Berlangsung" / "Menunggu Admin" |
| Merah | `bg-red-50` | Status "Dibatalkan" / peringatan "Jadwal Bentrok" |

Didefinisikan di [`apps/frontend/tailwind.config.js`](apps/frontend/tailwind.config.js).
Ikon custom (garis 2px, konsisten dengan mockup) ada di
[`apps/frontend/src/components/icons.tsx`](apps/frontend/src/components/icons.tsx).
Badge status/jenis sesi terpusat di
[`apps/frontend/src/components/StatusBadge.tsx`](apps/frontend/src/components/StatusBadge.tsx)
agar warnanya konsisten di semua halaman.

---

## 📱 PWA (Progressive Web App)

Frontend bisa di-install ke homescreen (HP) atau sebagai app desktop:
- `apps/frontend/public/manifest.json` — nama, ikon, warna tema
- `apps/frontend/public/service-worker.js` — cache runtime (network-first untuk
  halaman, cache-first untuk aset statis, **tidak pernah** meng-cache `/api/*`)
- `apps/frontend/public/offline.html` — fallback saat offline
- Didaftarkan lewat `src/components/ServiceWorkerRegister.tsx`

Sudah diverifikasi terinstal & service worker aktif di Chrome asli (bukan hanya
lolos build).

---

## 🔔 Push Notification

Selain bel notifikasi in-app (polling tiap 60 detik saat app terbuka), sistem
bisa mengirim **Web Push** asli yang muncul di notification tray HP/desktop
walau app-nya tertutup.

**Cara kerja:** setiap `createNotification()` di backend (jadwal
baru/berubah/bentrok) otomatis mencoba kirim push ke semua device yang
subscribe milik user itu — best-effort, gagal kirim tidak pernah menggagalkan
aksi utamanya (lihat `apps/backend/src/services/pushService.ts`).

**Cara aktifkan (per user, per device):**
1. Login, klik ikon lonceng di header
2. Klik **"Aktifkan"** pada banner "Aktifkan notifikasi langsung ke HP/desktop?"
3. Izinkan prompt permission browser
4. Device tersebut sekarang tersimpan di tabel `PushSubscription` dan akan
   menerima push untuk notifikasi berikutnya

**Batasan yang perlu diketahui:**
- Butuh HTTPS saat production (localhost dikecualikan untuk dev)
- **iOS/Safari:** baru didukung iOS 16.4+, dan **wajib** sudah di-"Add to Home
  Screen" dulu — tidak akan jalan dari Safari biasa
- Kalau `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` belum di-set, fitur ini senyap
  nonaktif (bel in-app tetap berfungsi normal, tidak ada yang error)

---

## 🌐 Deploy (coba-coba online)

Backend kita adalah server Express yang jalan terus-menerus + ada cron job
jam-jaman (auto-lock sesi telat) — **tidak cocok** langsung di-deploy sebagai
serverless function Vercel. Cara paling gampang & minim ubah kode: pisah tiga
layanan, masing-masing ke platform yang memang didesain untuknya.

| Bagian | Platform | Kenapa |
|---|---|---|
| Frontend (Next.js) | **Vercel** | Memang dibuat untuk Next.js, deploy paling mulus |
| Backend (Express) | **Railway** atau **Render** | Support server yang nyala terus + cron job tanpa ubah kode sama sekali |
| Database | **Neon** atau Postgres bawaan Railway | Postgres cloud gratis, bisa diakses dari internet |

*(Tidak menyiapkan akun/deploy untuk Anda — bikin akun & isi data pembayaran itu
harus Anda sendiri yang lakukan. Di bawah ini langkah persisnya.)*

### 1. Database — Neon (atau Postgres Railway)

1. Buat project baru di [neon.tech](https://neon.tech) (gratis, tanpa kartu kredit)
2. Salin **connection string** yang diberikan (formatnya sudah `postgresql://...`,
   biasanya sudah termasuk `?sslmode=require`)
3. Simpan dulu — ini jadi `DATABASE_URL` di langkah backend

### 2. Backend — Railway

1. Buat project baru di [railway.app](https://railway.app), pilih **Deploy from GitHub repo** → pilih repo ini
2. Di pengaturan service: **Root Directory** = `apps/backend`
3. **Build Command**:
   ```
   cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @absensiku/backend run build
   ```
4. **Start Command**:
   ```
   node dist/index.js
   ```
5. Isi **Environment Variables** di dashboard Railway (bukan file `.env` — jangan pernah commit yang asli):

   | Variabel | Nilai |
   |---|---|
   | `DATABASE_URL` | connection string dari Neon (langkah 1) |
   | `JWT_SECRET` | string acak baru, jangan pakai yang di dev |
   | `JWT_EXPIRES_IN` | `7d` |
   | `NODE_ENV` | `production` |
   | `PORT` | biasanya di-set otomatis oleh Railway, tidak perlu diisi manual |
   | `FRONTEND_URL` | URL Vercel dari langkah 3 (isi setelah frontend dideploy) — batasi CORS supaya bukan `*` di production |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | generate baru: `node -e "console.log(require('web-push').generateVAPIDKeys())"` |

6. Deploy. Setelah jalan, terapkan migration & buat admin pertama **sekali saja**
   lewat Railway's terminal/shell (atau jalankan dari komputer Anda dengan
   `DATABASE_URL` production di-export sementara):
   ```bash
   npx prisma migrate deploy
   curl -X POST https://<url-railway-anda>/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@pionerclass.com","password":"<password-baru>","role":"ADMIN"}'
   ```
7. Catat URL backend-nya (misal `https://absensiku-backend.up.railway.app`)

### 3. Frontend — Vercel

1. Buat project baru di [vercel.com](https://vercel.com) → **Import Git Repository** → pilih repo ini
2. Di **Root Directory**, pilih `apps/frontend` (Vercel otomatis mendeteksi ini sebagai Next.js monorepo)
3. Isi **Environment Variable**:

   | Variabel | Nilai |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<url-railway-anda>/api` |

4. Deploy. Setelah dapat URL Vercel-nya, **kembali ke Railway** dan isi
   `FRONTEND_URL` dengan URL Vercel tadi, lalu redeploy backend supaya CORS-nya
   benar

### Catatan

- **Web Push butuh HTTPS** — Vercel & Railway sudah otomatis HTTPS, jadi ini aman
- Setiap kali ada perubahan `schema.prisma`, migration baru harus dijalankan
  manual ke database production (`npx prisma migrate deploy` dengan
  `DATABASE_URL` production) — tidak otomatis jalan saat deploy
- Ini setup untuk **coba-coba/demo**, bukan hardening production penuh
  (rate-limiting, monitoring, backup DB terjadwal, dll belum ada)

---

## 🆘 Troubleshooting

**"P1000: Authentication failed" saat migrate/connect:**
```bash
# ⚠️ Kalau password DB mengandung karakter "@", itu bentrok dengan delimiter "@"
# di format postgresql://user:pass@host — harus di-encode jadi "%40".
# SALAH:  postgresql://postgres:MyPass@word@localhost:5432/db_absensiku
# BENAR:  postgresql://postgres:MyPass%40word@localhost:5432/db_absensiku
```

**PostgreSQL belum jalan (Windows):**
```bash
netstat -ano -p TCP | findstr :5432
"C:\Program Files\PostgreSQL\15\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\15\data" start
```

**"Port already in use" (3000/3001):**
```bash
netstat -ano | findstr :3001
# catat PID di kolom terakhir, lalu:
taskkill /F /PID <pid>
# atau cukup jalankan stop.bat
```

**`pnpm install` gagal:**
```bash
pnpm store prune
rm -rf node_modules
pnpm install
```

**Prisma Client gagal di-generate ulang (EPERM / file lock):**
Matikan dulu proses backend yang sedang jalan (dia mengunci file DLL query
engine), baru jalankan `npx prisma generate`.

---

## 📝 Keputusan & batasan yang disengaja

- **`bcryptjs`, bukan `bcrypt`** — native binding `bcrypt` sering gagal build di
  Windows tanpa Visual Studio Build Tools.
- **`node-cron`, bukan BullMQ+Redis** — kebutuhan job terjadwal cuma satu (auto-lock
  sesi telat, tiap jam), tidak perlu infrastruktur queue terpisah.
- **Sesi reguler tidak tercatat per-siswa langsung** — presensi reguler tercatat
  per kelas (`AttendanceRecord`), jadi histori sesi di halaman detail siswa hanya
  menampilkan sesi **privat**. Untuk kehadiran kelas reguler, gunakan halaman
  Rekap dengan filter Kelas.
- **Tentor hanya boleh membuat jadwal *privat* untuk dirinya sendiri** — pembuatan
  kelas reguler tetap admin-only karena terikat struktur kelas & enrollment.
- **Password default di README ini** (`admin123`, `tentor123`) hanya untuk
  development lokal — wajib diganti sebelum dipakai di luar itu.

---

**Terakhir diperbarui:** 2026-08-27
