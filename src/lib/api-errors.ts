import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BOOKING_CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "UPSTREAM_AI_ERROR"
  | "UPSTREAM_TIMEOUT";

export interface ApiErrorPayload {
  error: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Build a standardized error JSON payload matching API_CONTRACT.md §1. */
export function buildApiErrorPayload(
  error: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): ApiErrorPayload {
  return details ? { error, message, details } : { error, message };
}

/** Return a NextResponse JSON error matching API_CONTRACT.md §1. */
export function apiError(
  status: number,
  error: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): NextResponse<ApiErrorPayload> {
  return NextResponse.json(buildApiErrorPayload(error, message, details), {
    status,
  });
}
