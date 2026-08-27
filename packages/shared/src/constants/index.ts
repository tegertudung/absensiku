// ============================================
// SESSION STATUS CONSTANTS
// ============================================

export const SESSION_STATUS = {
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING_ADMIN: 'PENDING_ADMIN',
  COMPLETED: 'COMPLETED',
  CANCELLED_NOT_COUNTED: 'CANCELLED_NOT_COUNTED',
} as const;

export type SessionStatusType = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

// ============================================
// SESSION TYPE CONSTANTS
// ============================================

export const SESSION_TYPE = {
  REGULAR: 'REGULAR',
  PRIVATE: 'PRIVATE',
} as const;

export type SessionTypeType = (typeof SESSION_TYPE)[keyof typeof SESSION_TYPE];

// ============================================
// USER ROLE CONSTANTS
// ============================================

export const ROLES = {
  ADMIN: 'ADMIN',
  TENTOR: 'TENTOR',
} as const;

export type RoleType = (typeof ROLES)[keyof typeof ROLES];

// ============================================
// PRIVATE PACKAGE STATUS CONSTANTS
// ============================================

export const PACKAGE_STATUS = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

// ============================================
// TUTOR STATUS CONSTANTS
// ============================================

export const TUTOR_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ON_LEAVE: 'ON_LEAVE',
} as const;

// ============================================
// STUDENT STATUS CONSTANTS
// ============================================

export const STUDENT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  GRADUATED: 'GRADUATED',
} as const;

// ============================================
// BUSINESS RULES CONSTANTS
// ============================================

export const BUSINESS_RULES = {
  QUOTA_PER_PACKAGE: 24,
  TUTOR_INPUT_DEADLINE_DAYS: 3,
  MIN_HONOR_RATE: 0,
  MAX_HONOR_RATE: 999999999,
} as const;

// ============================================
// API CONSTANTS
// ============================================

export const API_ENDPOINTS = {
  HEALTH: '/api/health',
  AUTH_LOGIN: '/api/auth/login',
  AUTH_LOGOUT: '/api/auth/logout',
  SESSIONS: '/api/sessions',
  SESSIONS_COMPLETE: '/api/sessions/:id/complete',
  SESSIONS_CANCEL: '/api/sessions/:id/cancel',
  RECAP: '/api/recap',
  EXPORT: '/api/export',
  TUTORS: '/api/tutors',
  STUDENTS: '/api/students',
} as const;

// ============================================
// ERROR MESSAGES
// ============================================

export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden - insufficient permissions',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation error',
  DATABASE_ERROR: 'Database error',
  INTERNAL_ERROR: 'Internal server error',
  INVALID_TOKEN: 'Invalid or expired token',
  QUOTA_EXHAUSTED: 'Package quota exhausted',
  SESSION_COMPLETED: 'Session already completed',
  INVALID_STATUS: 'Invalid session status',
} as const;

// ============================================
// SUCCESS MESSAGES
// ============================================

export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  SESSION_CREATED: 'Session created successfully',
  SESSION_COMPLETED: 'Session completed successfully',
  SESSION_CANCELLED: 'Session cancelled successfully',
  EXPORT_SUCCESS: 'Export successful',
} as const;
