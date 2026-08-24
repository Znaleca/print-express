import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const ONBOARDING_ROLES = ["CUSTOMER", "BUSINESS_OWNER"];
export const ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "SKIPPED"];
export const DEFAULT_ONBOARDING_VERSION = "v1";

export class OnboardingRequestError extends Error {
  constructor(message, status = 400, code = "ONBOARDING_REQUEST_ERROR") {
    super(message);
    this.name = "OnboardingRequestError";
    this.status = status;
    this.code = code;
  }
}

export function getBearerToken(request) {
  const value = request.headers.get("authorization") || "";
  const token = value.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

function getUserScopedClient(token) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new OnboardingRequestError("Supabase is not configured.", 500, "SERVER_CONFIGURATION_ERROR");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
}

export async function getOnboardingContext(request) {
  const token = getBearerToken(request);
  if (!token) {
    throw new OnboardingRequestError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const admin = getSupabaseAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;

  if (userError || !user) {
    throw new OnboardingRequestError("Your session has expired. Please sign in again.", 401, "UNAUTHORIZED");
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new OnboardingRequestError("Unable to load your account role.", 500, "PROFILE_LOOKUP_FAILED");
  }

  if (!profile || !ONBOARDING_ROLES.includes(profile.role)) {
    throw new OnboardingRequestError(
      "This account does not have a customer or business-owner tutorial.",
      403,
      "ONBOARDING_NOT_AVAILABLE"
    );
  }

  return {
    token,
    user,
    role: profile.role,
    supabase: getUserScopedClient(token),
  };
}

export function normalizeTutorialVersion(value) {
  const version = String(value ?? DEFAULT_ONBOARDING_VERSION).trim();
  if (!/^[a-zA-Z0-9._-]{1,32}$/.test(version)) {
    throw new OnboardingRequestError("Invalid tutorial version.", 400, "INVALID_TUTORIAL_VERSION");
  }
  return version;
}

export function normalizeCurrentStep(value, fallback = 0) {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  const step = Number(raw);
  if (!Number.isInteger(step) || step < 0 || step > 50) {
    throw new OnboardingRequestError("Invalid onboarding step.", 400, "INVALID_ONBOARDING_STEP");
  }
  return step;
}

export function normalizeStatus(value, fallback = "IN_PROGRESS") {
  const status = String(value ?? fallback).trim().toUpperCase();
  if (!ONBOARDING_STATUSES.includes(status)) {
    throw new OnboardingRequestError("Invalid onboarding status.", 400, "INVALID_ONBOARDING_STATUS");
  }
  return status;
}

export async function callOnboardingRpc(context, functionName, args) {
  const { data, error } = await context.supabase.rpc(functionName, args);
  if (!error) return Array.isArray(data) ? data[0] || null : data || null;

  const message = String(error.message || "Unable to update onboarding progress.");
  const status = /authentication|role|invalid|unsupported|required|between|step|status/i.test(message)
    ? 400
    : 500;

  throw new OnboardingRequestError(message, status, "ONBOARDING_RPC_FAILED");
}

