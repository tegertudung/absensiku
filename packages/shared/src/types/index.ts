// ============================================
// SESSION TYPES
// ============================================

export type SessionType = 'REGULAR' | 'PRIVATE';
export type SessionStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'PENDING_ADMIN'
  | 'COMPLETED'
  | 'CANCELLED_NOT_COUNTED';

export interface TeachingSession {
  id: string;
  tutor_id: string;
  session_type: SessionType;
  session_date: Date;
  status: SessionStatus;
  honor_rate_snapshot: number | null;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

// ============================================
// USER & AUTHENTICATION TYPES
// ============================================

export type UserRole = 'ADMIN' | 'TENTOR';

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  role: UserRole;
  is_active: boolean;
  last_login?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ============================================
// TUTOR TYPES
// ============================================

export interface Tutor {
  id: string;
  user_id: string;
  name: string;
  phone?: string;
  email?: string;
  hire_date?: Date;
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
  bank_account?: string;
  bank_name?: string;
  bank_holder_name?: string;
  created_at?: Date;
  updated_at?: Date;
}

// ============================================
// STUDENT TYPES
// ============================================

export interface Student {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  guardian_name?: string;
  guardian_phone?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'GRADUATED';
  created_at?: Date;
  updated_at?: Date;
}

// ============================================
// PRIVATE PACKAGE TYPES
// ============================================

export interface PrivatePackage {
  id: string;
  student_id: string;
  quota_total: number;
  quota_used: number;
  quota_remaining: number;
  activation_date: Date;
  expiry_date?: Date;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  package_name?: string;
  price?: number;
  payment_date?: Date;
  payment_method?: string;
  created_at?: Date;
  updated_at?: Date;
}

// ============================================
// HONOR RATE TYPES
// ============================================

export interface HonorRate {
  id: string;
  session_type: SessionType;
  subject_id?: string;
  nominal: number;
  effective_from: Date;
  effective_to?: Date;
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
  created_at?: Date;
  updated_at?: Date;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

export interface ApiError {
  error: string;
  message: string;
  status?: number;
  details?: Record<string, any>;
}

// ============================================
// PAGINATION TYPES
// ============================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  skip?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
