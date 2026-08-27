import { z } from 'zod';

// ============================================
// AUTHENTICATION VALIDATORS
// ============================================

export const loginSchema = z.object({
  email: z.string().email('Email must be valid'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email('Email must be valid'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['ADMIN', 'TENTOR']),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ============================================
// SESSION VALIDATORS
// ============================================

export const createSessionSchema = z.object({
  tutor_id: z.string().uuid('Invalid tutor ID'),
  session_type: z.enum(['REGULAR', 'PRIVATE']),
  session_date: z.string().datetime('Invalid date format'),
  class_id: z.string().uuid('Invalid class ID').optional(),
  student_id: z.string().uuid('Invalid student ID').optional(),
  subject_id: z.string().uuid('Invalid subject ID').optional(),
  notes: z.string().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const completeSessionSchema = z.object({
  session_id: z.string().uuid('Invalid session ID'),
  status: z.enum(['COMPLETED', 'CANCELLED_NOT_COUNTED']),
  notes: z.string().optional(),
});

export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

// ============================================
// PRIVATE PACKAGE VALIDATORS
// ============================================

export const createPrivatePackageSchema = z.object({
  student_id: z.string().uuid('Invalid student ID'),
  quota_total: z.number().min(1, 'Quota must be at least 1'),
  package_name: z.string().optional(),
  price: z.number().optional(),
  payment_date: z.string().datetime('Invalid date format').optional(),
  payment_method: z.string().optional(),
});

export type CreatePrivatePackageInput = z.infer<typeof createPrivatePackageSchema>;

// ============================================
// TUTOR VALIDATORS
// ============================================

export const createTutorSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Email must be valid'),
  phone: z.string().optional(),
  hire_date: z.string().datetime('Invalid date format').optional(),
  bank_account: z.string().optional(),
  bank_name: z.string().optional(),
  bank_holder_name: z.string().optional(),
});

export type CreateTutorInput = z.infer<typeof createTutorSchema>;

// ============================================
// RECAP & FILTER VALIDATORS
// ============================================

export const recapFilterSchema = z.object({
  start_date: z.string().datetime('Invalid date format').optional(),
  end_date: z.string().datetime('Invalid date format').optional(),
  tutor_id: z.string().uuid('Invalid tutor ID').optional(),
  session_type: z.enum(['REGULAR', 'PRIVATE']).optional(),
  class_id: z.string().uuid('Invalid class ID').optional(),
  subject_id: z.string().uuid('Invalid subject ID').optional(),
  status: z.enum(['COMPLETED', 'PENDING_ADMIN', 'CANCELLED_NOT_COUNTED']).optional(),
  page: z.number().min(1, 'Page must be at least 1').optional(),
  limit: z.number().min(1).max(100, 'Limit cannot exceed 100').optional(),
});

export type RecapFilterInput = z.infer<typeof recapFilterSchema>;
