// NOTE: Environment variables are preloaded via `-r dotenv/config` in package.json's
// dev/start scripts (DOTENV_CONFIG_PATH points at the root .env). This guarantees
// env vars are set BEFORE any import below runs — critical because importing
// authRouter transitively constructs the Prisma Client, which needs DATABASE_URL
// available immediately.
import express from 'express';
import cors from 'cors';
import authRouter from './api/auth';
import sessionsRouter from './api/sessions';
import tutorsRouter from './api/tutors';
import studentsRouter from './api/students';
import subjectsRouter from './api/subjects';
import classesRouter from './api/classes';
import honorRatesRouter from './api/honorRates';
import exportRouter from './api/export';
import schedulesRouter from './api/schedules';
import dashboardRouter from './api/dashboard';
import privatePackagesRouter from './api/privatePackages';
import { startOverdueSessionLockJob } from './jobs/lockOverdueSessions';
import auditLogsRouter from './api/auditLogs';
import notificationsRouter from './api/notifications';
import pushRouter from './api/push';
import programsRouter from './api/programs';
import settingsRouter from './api/settings';
import honorSlipRouter from './api/honorSlip';
import parentsRouter from './api/parents';
import parentPortalRouter from './api/parentPortal';
import { SETTINGS_UPLOAD_ROOT } from './middleware/settingsUpload';

const app = express();
const PORT = process.env.PORT || 3001;
const ENV = process.env.NODE_ENV || 'development';

// Middleware
// FRONTEND_URL restricts CORS to the deployed frontend origin in production
// (comma-separated for multiple, e.g. preview + prod Vercel URLs). Left
// unset, cors() falls back to allowing any origin — fine for local dev,
// where the frontend is always http://localhost:3000 anyway.
const allowedOrigins = process.env.FRONTEND_URL?.split(',').map((o) => o.trim());
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads/settings', express.static(SETTINGS_UPLOAD_ROOT));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server running',
    environment: ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/tutors', tutorsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/subjects', subjectsRouter);
app.use('/api/classes', classesRouter);
app.use('/api/honor-rates', honorRatesRouter);
app.use('/api/export', exportRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/private-packages', privatePackagesRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/push', pushRouter);
app.use('/api/programs', programsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/honor', honorSlipRouter);
app.use('/api/parents', parentsRouter);
app.use('/api/parent', parentPortalRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     🚀 ABSENSIKU BACKEND STARTED       ║
╠════════════════════════════════════════╣
║ Environment: ${ENV.padEnd(30)} ║
║ Port:        ${String(PORT).padEnd(30)} ║
║ URL:         http://localhost:${PORT}     ║
║ Health:      /api/health            ║
╚════════════════════════════════════════╝
  `);

  startOverdueSessionLockJob();
});

process.on('unhandledRejection', (reason: Error) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});
