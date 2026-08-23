import crypto from "crypto";

function getOtpSecret() {
  const secret = process.env.OTP_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("OTP_HASH_SECRET is not configured.");
  return secret;
}

export function hashOtp({ email, type, code }) {
  return crypto
    .createHmac("sha256", getOtpSecret())
    .update(`${type}:${email}:${code}`)
    .digest("hex");
}

export function hashRateLimitScope(value) {
  return crypto
    .createHmac("sha256", getOtpSecret())
    .update(String(value || "unknown"))
    .digest("hex");
}

export function getRequestIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

export function getRequestDevice(request) {
  return request.headers.get("user-agent") || "unknown";
}

export function safeEqualHex(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
