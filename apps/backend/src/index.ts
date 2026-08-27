// NOTE: Environment variables are preloaded via `-r dotenv/config` in package.json's
// dev/start scripts (DOTENV_CONFIG_PATH points at the root .env). This guarantees
// env vars are set BEFORE any import below runs — critical because importing
// authRouter transitively constructs the Prisma Client, which needs DATABASE_URL
// available immediately.
import express from 'express';
import cors from 'cors';
import authRouter from './api/auth';
import sessionsRouter from './api/sessions';

const app = express();
const PORT = process.env.PORT || 3001;
const ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
});

process.on('unhandledRejection', (reason: Error) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});
