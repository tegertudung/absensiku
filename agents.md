# Pioner Class Attendance System

## Project Context

This repository contains the Pioner Class attendance and teaching management system.

The backend logic has already been implemented and is currently considered the source of truth.

The current priority is frontend refactoring and UI/UX improvement.

---

## CRITICAL RULE: DO NOT CHANGE BACKEND

Do not modify backend logic unless explicitly requested by the user.

Do not change:

- API endpoints
- controllers
- services
- database schema
- migrations
- models
- request payload structure
- API response structure
- authentication
- authorization
- attendance logic
- schedule logic
- teaching-session logic
- private-package logic
- honor/payment calculations

If a frontend requirement appears to require a backend change:

1. Do not modify the backend automatically.
2. Explain what backend data or behavior is missing.
3. Propose the smallest possible change.
4. Wait for explicit approval.

---

## PRESERVE EXISTING FUNCTIONALITY

The existing application logic is already working.

Before modifying frontend code:

1. Inspect the existing implementation.
2. Preserve existing API calls.
3. Preserve submit handlers.
4. Preserve request payloads.
5. Preserve routes.
6. Preserve existing working actions.

Do not rewrite working logic only for code cleanup.

Prefer incremental frontend refactoring.

---

## CURRENT FRONTEND PRIORITY

Current pages being improved:

1. Admin layout
2. Data Siswa
3. Tambah Siswa
4. Data Tentor
5. Dashboard Admin

Do not modify unrelated pages unless required for shared layout/components.

Tutor frontend will be handled separately.

---

## DESIGN DIRECTION

The admin interface should be clean, modern, professional, and suitable for an education administration system.

Use:

- dark navy sidebar
- light neutral page background
- white content cards
- subtle borders
- restrained shadows
- consistent spacing
- consistent typography
- clear buttons
- clean tables
- compact badges
- consistent form controls

Avoid:

- excessive gradients
- glassmorphism
- excessive animations
- excessive shadows
- flashy landing-page design
- unnecessary decorative components

This is an operational administration system.

---

## ADMIN LAYOUT

Use a consistent admin application shell.

Sidebar:

- Pioner Class logo/name
- Dashboard
- AKADEMIK
- Data Siswa
- Data Tentor
- Kelas
- Privat
- Jadwal
- Laporan
- Pengaturan
- Admin profile

Do not change existing route paths.

Main area:

- topbar
- breadcrumb
- page title
- page description
- page actions
- main content

---

## FRONTEND COMPONENTS

Prefer reusable components where appropriate, such as:

- AdminAppShell
- Sidebar
- Topbar
- PageHeader
- FilterBar
- SearchInput
- StatusBadge
- ProgramBadge
- SectionCard
- DataTable
- Pagination
- FormField
- EmptyState
- LoadingState
- ErrorState

Do not over-engineer abstractions.

Reuse existing components whenever possible.

---

## DATA RULES

Never fabricate application data.

Do not invent:

- student data
- tutor data
- schedules
- package sessions
- honor amounts
- alerts
- attendance records
- operational statistics

Use only data available from the existing application/backend.

If data is unavailable, use an appropriate empty state or omit the unsupported visual element.

---

## FRONTEND DATA TRANSFORMATION

UI-specific formatting should be handled in the frontend when possible.

Examples:

- backend status -> visual status badge
- program type -> Reguler / Privat badge
- session count -> progress display
- tutor subjects -> chips
- backend enum -> readable Indonesian label

Do not change backend field names simply to improve presentation.

---

## LANGUAGE

User-facing UI should primarily use Indonesian.

Keep terminology consistent.

Examples:

- Data Siswa
- Data Tentor
- Tambah Siswa
- Tambah Tentor
- Mata Pelajaran
- Jadwal Aktif
- Program Belajar
- Reguler
- Privat
- Aktif
- Nonaktif
- Simpan
- Batal

---

## DEPENDENCIES

Follow the existing frontend framework and styling approach.

Do not:

- migrate frameworks
- replace the project's UI stack
- install large UI libraries unnecessarily
- update package versions unnecessarily

Prefer existing dependencies.

---

## RESPONSIVENESS

Admin frontend is desktop-first.

Ensure:

- good desktop layout
- usable tablet layout
- basic small-screen fallback

Tutor frontend will later be designed mobile-first.

---

## CODEX EFFICIENCY

Avoid unnecessary repository exploration.

Do not scan:

- node_modules
- vendor
- dist
- build
- coverage
- caches
- generated files
- unrelated backend modules

Read only files needed for the current task.

Use targeted searches.

Do not repeatedly run the full test/build suite after every small change.

---

## VERIFICATION

After frontend changes:

1. Verify existing routes remain unchanged.
2. Verify existing APIs remain unchanged.
3. Verify request payloads remain unchanged.
4. Verify existing actions still work.
5. Verify no backend files were modified.
6. Run appropriate frontend lint/typecheck/build when available.
7. Do not fix unrelated pre-existing issues without approval.

---

## FINAL RESPONSE

After completing a task, report briefly:

- files changed
- frontend improvements
- reusable components created/updated
- verification performed
- backend changes

Backend changes should be "None" unless explicitly approved.

---

## MOST IMPORTANT RULE

If you are unsure whether a requested change affects backend/business logic, do not modify it.

Explain the issue and ask for approval first.

# CURRENT LOCKED BUSINESS RULES

These requirements have been discussed and should be treated as the current target business rules.

## System Purpose

The system remains primarily a tutoring-center teaching attendance, session recording, and tutor recap/honor system.

Do not introduce unnecessary approval workflows.

There is no required Admin approval after every teaching session.

---

## Learning Programs

Current primary programs:

- Reguler
- Privat

The architecture should later support additional programs through Master Program configuration.

Do not permanently hardcode the application architecture to only REGULAR and PRIVATE if a configurable program model can be introduced safely.

---

## Session Quota

### Reguler

Regular classes use a meeting quota.

The quota belongs to the CLASS, not individually to each enrolled student.

Current default:

24 meetings.

Example:

Kelas 9A
24 total meetings
1 completed regular session
remaining becomes 23.

Even when there are multiple students in the class, the quota decreases only once.

No individual student attendance is required for Regular sessions.

### Privat

Private quota belongs to the private student/package.

Current default:

24 meetings.

One completed private session decreases remaining quota by one.

Only Admin may add another meeting cycle/package.

Tutor cannot increase or modify quota.

---

## When Quota Reaches Zero

The existing schedule should remain visible.

Tutor must not be allowed to record another teaching session while quota is zero.

Display a warning asking the Tutor to contact Admin.

Admin is responsible for adding the next meeting cycle.

Do not allow quota to become negative.

---

## Adding Meetings

Current normal cycle:

24 meetings.

Do not implement arbitrary custom quota input in the primary workflow yet.

For current Reguler and Privat flows, Admin adds another 24-meeting cycle.

Future programs may define another default meeting count through Master Program.

---

## Regular Session Recording

For Reguler, Tutor records:

- Materi Hari Ini: required
- Catatan Mengajar: optional

Do NOT require:

- student attendance
- individual student scores
- individual student learning notes

When completed:

- regular class quota decreases by 1
- session enters tutor history
- session enters Admin recap
- tutor honor is calculated

---

## Private Session Recording

For Privat, Tutor records:

- Materi Hari Ini: required
- Catatan Perkembangan: required
- Nilai: optional

Do NOT require a separate Hadir / Tidak Hadir field.

If a private teaching record is completed, it represents a teaching session that occurred.

When completed:

- private quota decreases by 1
- session enters tutor history
- session enters Admin recap
- tutor honor is calculated
- private learning progress is stored

---

## Daily Completion

Tutor should be able to save teaching-session information during the day.

Provide a workflow equivalent to:

Selesaikan Semua Kelas Hari Ini

Only sessions for that Tutor and selected/current date should be considered.

Completed/ready sessions can be finalized together.

Do not add Admin approval after this action.

---

## Schedule Conflict

Schedules belonging to the same Tutor may overlap up to the configured maximum overlap.

Current default:

30 minutes.

Example:

13:00-14:30
14:00-15:30

30 minute overlap -> allowed.

Example:

13:00-14:30
13:45-15:15

45 minute overlap -> blocked when configured maximum is 30 minutes.

This value should eventually come from Global Settings rather than permanent hardcode.

---

## Student Phone

Student phone is required.

Validation:

- numbers only
- maximum 13 digits

Store phone numbers as strings, not numeric database values.

---

## Tutor Honor

Tutor honor comes from completed teaching sessions.

Honor may differ by program/package.

Do not assume one universal Regular rate and one universal Private rate forever.

Honor should eventually be configurable per Master Program.

Completed sessions must preserve a snapshot of the honor rate used at that time.

Changing the current Master Honor must not recalculate historical completed sessions.

---

## Tutor Honor Slip

Honor slip is generated per Tutor and per month/year.

It should support:

- Tutor full name
- Tutor academic/professional title when available
- period month/year
- program-based honor breakdown
- number of sessions per program
- rate
- subtotal
- total sessions
- total honor
- institution information
- owner/signatory name
- owner/signatory title
- owner signature
- Tutor signature area or Tutor signature when available

PDF should be suitable for formal A4 printing.

---

## Global Settings

Target settings architecture:

### Identitas Sistem

- application/system name
- institution name
- logo
- owner/signatory name
- signatory title
- document location
- domain information

### Master Program

Program should support configuration such as:

- program name
- program code
- learning model
- class-based or individual
- whether session quota is used
- default number of meetings
- active/inactive status

Current examples:

Reguler:
class-based

Privat:
individual

### Honor Tentor

Honor configuration should be associated with Program.

Support:

- honor per session
- effective date
- historical rate records

### Jadwal & Sesi

Support configurable:

- maximum schedule overlap
- low-session warning threshold
- zero-session blocking
- daily completion feature

### Dokumen & PDF

Support configuration for:

- document logo
- institution name
- signatory
- signatory title
- signature image
- document location
- footer

---

## Parent Account

Parent account functionality is NOT part of the current implementation priority.

Do not implement Parent portal, Parent login, or Parent reports unless explicitly requested later.

---

## IMPORTANT DEVELOPMENT RULE

When implementing these revisions:

Do not blindly rewrite the existing system.

First inspect existing schema, backend services, APIs, and frontend.

Reuse existing structures whenever they can correctly support the requirement.

If a database/schema change is necessary, clearly identify it before implementation.