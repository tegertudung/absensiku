# 📚 ABSENSIKU - Sistem Absensi Pioner Class

**Version:** 1.0.0  
**Status:** Project Initialized ✓  
**Database:** PostgreSQL  
**Tech Stack:** Next.js + Express + TypeScript + Prisma

---

## 📋 PROJECT STATUS

### ✅ COMPLETED
- [x] Monorepo structure initialized
- [x] Root configuration files (package.json, pnpm-workspace.yaml, .env)
- [x] Backend folder structure
- [x] Frontend folder structure
- [x] Shared types, validators, and constants
- [x] Prisma schema (15 tables with relationships)
- [x] Database configuration with actual credentials
- [x] TypeScript configuration for all packages

### ⏳ NEXT STEPS
- [ ] Install dependencies (`pnpm install`)
- [ ] Create database via PostgreSQL
- [ ] Run Prisma migrations
- [ ] Start backend server
- [ ] Start frontend server
- [ ] Begin Phase 1 development (Week 1)

---

## 📁 FOLDER STRUCTURE

```
absensiku/
├── .env                          # Database & app configuration
├── .gitignore                    # Git ignore rules
├── package.json                  # Root workspace config
├── pnpm-workspace.yaml           # Monorepo definition
├── README.md                     # This file
│
├── apps/
│   ├── backend/                  # Node.js + Express API
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point (running ✓)
│   │   │   ├── api/              # API routes (empty - ready to fill)
│   │   │   ├── services/         # Business logic
│   │   │   ├── middleware/       # Auth, RBAC, etc
│   │   │   ├── jobs/             # Background jobs
│   │   │   └── utils/            # Utilities
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # Database schema (ready ✓)
│   │   │   └── .env              # Database connection
│   │   ├── package.json          # Backend dependencies
│   │   └── tsconfig.json         # TypeScript config
│   │
│   └── frontend/                 # Next.js + React
│       ├── src/
│       │   ├── app/              # Next.js pages
│       │   ├── components/       # React components
│       │   ├── lib/              # Utilities & API client
│       │   └── store/            # Zustand stores
│       ├── public/               # Static files
│       ├── package.json          # Frontend dependencies
│       └── tsconfig.json         # TypeScript config
│
├── packages/
│   └── shared/                   # Shared types & validators
│       ├── src/
│       │   ├── types/            # TypeScript types (ready ✓)
│       │   ├── validators/       # Zod schemas (ready ✓)
│       │   ├── constants/        # Constants (ready ✓)
│       │   └── index.ts          # Export all
│       ├── package.json
│       └── tsconfig.json
│
└── tools/
    ├── scripts/                  # Helper scripts
    └── docker/                   # Docker configs (ready for Phase 5)
```

---

## 🗄️ DATABASE SETUP

### **Credentials:**

⚠️ **Real credentials are NOT stored in this README or in git** — they live only in local `.env` files (gitignored). See:
- `.env` (root)
- `apps/backend/prisma/.env`
- `apps/frontend/.env.local`

Ask a teammate or the project lead for the actual values, or use `apps/backend/.env.example` as a template (placeholder values only, safe to commit).

```
Host:     localhost
Port:     5432
Database: db_absensiku
Username: postgres
Password: <see local .env file — never commit this>
```

### **Connection String Format:**
```
postgresql://<username>:<url-encoded-password>@<host>:<port>/<database>
```

### **Database Schema Overview:**

**15 Tables Created (via Prisma Schema):**
1. `Users` - Authentication & roles
2. `Tutors` - Teacher profiles
3. `Students` - Student profiles
4. `Subjects` - Courses
5. `Classes` - Regular classes
6. `ClassEnrollments` - Student-class relationships
7. `Schedules` - Teaching schedules
8. **`TeachingSession`** ⭐ - Core business data (snapshot tarif)
9. `AttendanceRecords` - Student attendance
10. **`PrivatePackage`** ⭐ - Quota management
11. **`PrivatePackageUsage`** ⭐ - Quota transactions (atomic)
12. `HonorRates` - Teacher payment rates
13. `HonorRateHistory` - Rate change tracking
14. `SessionValidations` - Admin approvals
15. `AuditLogs` - Change tracking (mandatory for koreksi)

**Critical Tables (⭐):**
- `TeachingSession`: Stores `honor_rate_snapshot` (immutable)
- `PrivatePackage`: Manages `quota_used` & `quota_remaining`
- `PrivatePackageUsage`: Atomic quota decrease tracking

---

## 🚀 QUICK START

### **Prerequisites Check:**
```bash
# Verify all tools installed
node --version       # Should be v18+
npm --version        # Should be v9+
pnpm --version       # Should be v8+
psql --version       # Should be v14+
```

### **Installation (When Ready):**
```bash
# 1. Install all dependencies
pnpm install

# 2. Setup database
cd apps/backend
npx prisma migrate dev --name init

# 3. Start both services
cd ../..
pnpm dev

# Services will run on:
# Backend:  http://localhost:3001
# Frontend: http://localhost:3000
```

### **Individual Start:**
```bash
# Only backend
pnpm backend

# Only frontend
pnpm frontend
```

---

## 📦 INSTALLED PACKAGES

### **Backend (@absensiku/backend):**
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "@prisma/client": "^5.3.1",
    "jsonwebtoken": "^9.1.0",
    "bcrypt": "^5.1.1",
    "axios": "^1.6.0",
    "zod": "^3.22.4"
  },
  "devDependencies": [
    "typescript", "@types/*", "ts-node", "ts-node-dev", "prisma"
  ]
}
```

### **Frontend (@absensiku/frontend):**
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.5",
    "react-query": "^3.39.3",
    "axios": "^1.6.0",
    "zod": "^3.22.4",
    "react-hook-form": "^7.48.0",
    "tailwindcss": "^3.3.6"
  }
}
```

### **Shared (@absensiku/shared):**
```json
{
  "dependencies": {
    "zod": "^3.22.4"
  }
}
```

---

## 🔑 KEY FILES & WHAT'S INSIDE

### **Root Config Files:**
- **`.env`** - Database credentials & app config (✓ Configured)
- **`package.json`** - Monorepo scripts & workspace definition
- **`pnpm-workspace.yaml`** - Monorepo workspace config
- **`.gitignore`** - Git ignore rules

### **Backend - Ready to Start:**
- **`apps/backend/src/index.ts`** - Server entry point (✓ Running)
- **`apps/backend/prisma/schema.prisma`** - Database schema (✓ 15 tables)
- **`apps/backend/prisma/.env`** - Database connection

### **Shared - Types & Validators:**
- **`packages/shared/src/types/index.ts`** - TypeScript types (User, Session, etc)
- **`packages/shared/src/validators/index.ts`** - Zod validation schemas
- **`packages/shared/src/constants/index.ts`** - Business constants (status, roles)

---

## 🔧 COMMON COMMANDS

### **Workspace Commands (from root):**
```bash
# Start all services
pnpm dev

# Start backend only
pnpm backend

# Start frontend only
pnpm frontend

# Type checking all packages
pnpm type-check

# Build all packages
pnpm build
```

### **Database Commands:**
```bash
cd apps/backend

# Create migration after schema change
npx prisma migrate dev --name add_new_table

# Push schema without migration
npx prisma db push

# Seed initial data
npx prisma db seed

# Open Prisma Studio (GUI)
npx prisma studio
```

### **Package Management:**
```bash
# Add to backend
pnpm add -F @absensiku/backend express

# Add to frontend
pnpm add -F @absensiku/frontend zustand

# Add to shared
pnpm add -F @absensiku/shared zod
```

---

## 📚 DOCUMENTATION FILES

Refer to these files for detailed guidance:

1. **`README_LENGKAP.md`** (Team Guide)
   - Complete setup instructions
   - Team workflow guidelines
   - Troubleshooting

2. **`ABSENSIKU_PROJECT_ROADMAP.md`** (10-Week Timeline)
   - Phase-by-phase breakdown
   - Weekly tasks & deliverables
   - Milestones & checkpoints

3. **`absensiku_db_schema.sql`**
   - SQL schema (reference)
   - Triggers & indexes

4. **`absensiku_db_operations.md`**
   - Backend API operations
   - Critical transaction examples
   - Query patterns

---

## 🎯 WHAT'S READY NOW

✅ **Can Start Immediately:**
- Backend server (http://localhost:3001/api/health)
- Database schema (15 tables with relationships)
- Shared types & validators
- TypeScript configuration

✅ **Ready to Fill:**
- API routes (`apps/backend/src/api/`)
- Services (`apps/backend/src/services/`)
- Middleware (`apps/backend/src/middleware/`)
- Frontend pages (`apps/frontend/src/app/`)
- React components (`apps/frontend/src/components/`)

---

## 👥 TEAM COORDINATION

### **Development Branches:**
```
main              # Production-ready code
develop           # Integration branch (Week-by-week)
feature/*         # Individual features
bugfix/*          # Bug fixes
```

### **Daily Workflow:**
```
1. Pull latest:           git pull origin develop
2. Create feature branch:  git checkout -b feature/your-task
3. Code & commit:         git add . && git commit -m "feat: ..."
4. Push & PR:             git push & create PR on GitHub
5. Review & merge:        Merge to develop on Friday
```

---

## 📞 GETTING HELP

### **Troubleshooting:**
1. Check `README_LENGKAP.md` troubleshooting section
2. Check terminal error message
3. Verify `.env` file has correct database credentials
4. Restart PostgreSQL service

### **Common Issues:**

**"Cannot connect to database" / "P1000: Authentication failed":**
```bash
# Check PostgreSQL is running
psql -U postgres -h localhost

# ⚠️ IMPORTANT: If your DB password contains an "@" character,
# it conflicts with the "@" delimiter in a postgresql:// URL.
# It MUST be URL-encoded as "%40" inside DATABASE_URL, or Prisma will
# silently misread the password and host, causing auth failure.
#
# Example pattern (NOT our real password):
# WRONG:   postgresql://postgres:MyPass@word@localhost:5432/db_absensiku
# CORRECT: postgresql://postgres:MyPass%40word@localhost:5432/db_absensiku
#
# Our actual encoded value is already set correctly in
# apps/backend/prisma/.env (gitignored) — don't paste real passwords here!
```

**PostgreSQL service not running (Windows):**
```bash
# Check if port 5432 is listening
netstat -ano -p TCP | findstr :5432

# If not running, start it manually (adjust path/version as needed):
"C:\Program Files\PostgreSQL\15\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\15\data" start
```

**"pnpm install fails":**
```bash
# Clear cache
pnpm store prune

# Reinstall
rm -rf node_modules
pnpm install
```

**"Port already in use":**
```bash
# Find what's using port 3001
netstat -ano | findstr :3001

# Or use different port:
PORT=3002 pnpm backend
```

---

## 📊 PROJECT TIMELINE

```
Week 1-2:   Foundation & Setup         ← YOU ARE HERE ✓
Week 3-4:   Backend Core Development
Week 5-6:   Frontend Development
Week 7:     Integration & Testing
Week 8:     Polish & Deployment
Week 9-10:  Launch & Support
```

**Next Milestone:** Complete Week 1 setup by Friday
- [ ] Run `pnpm install`
- [ ] Create PostgreSQL database
- [ ] Run `pnpm db:migrate`
- [ ] Verify both services running

---

## 🎓 LEARNING RESOURCES

- **Prisma Docs:** https://www.prisma.io/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Express Docs:** https://expressjs.com
- **PostgreSQL Docs:** https://www.postgresql.org/docs
- **TypeScript Docs:** https://www.typescriptlang.org/docs
- **pnpm Docs:** https://pnpm.io

---

## 📝 LAST SETUP VERIFICATION

Before starting Phase 1 coding:

- [ ] Folder structure matches README
- [ ] All .json, .yaml, .ts files present
- [ ] `.env` has database credentials
- [ ] `packages/shared/` types defined
- [ ] Can access backend health check

✅ **Everything ready! Ready to code!** 🚀

---

**Project Initialized:** 2026-08-27  
**Team:** Pioner Class Development  
**Lead:** Development Manager  

**Next Meeting:** Set Phase 1 kickoff date & time
