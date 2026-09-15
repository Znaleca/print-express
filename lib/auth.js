export const AUTH_ROLES = ["CUSTOMER", "BUSINESS_OWNER", "ADMIN"];
export const SIGNUP_ROLES = ["CUSTOMER", "BUSINESS_OWNER"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_SYMBOL_PATTERN = /[!@#$%^&*(),.?":{}|<>]/;

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function getPasswordRequirements(value) {
  const password = String(value || "");
  return {
    length: password.length >= 8 && password.length <= 128,
    capital: /[A-Z]/.test(password),
    symbol: PASSWORD_SYMBOL_PATTERN.test(password),
  };
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 8 || password.length > 128) {
    return "Password must be between 8 and 128 characters.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!PASSWORD_SYMBOL_PATTERN.test(password)) {
    return "Password must include at least one special symbol.";
  }
  return null;
}

export function getRoleHome(role) {
  return {
    ADMIN: "/admin",
    BUSINESS_OWNER: "/owner",
    CUSTOMER: "/browse",
  }[role] || null;
}
