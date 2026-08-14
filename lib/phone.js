export function normalizePhilippinePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("0063")) digits = digits.slice(2);
  if (digits.startsWith("63")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length !== 10 || !digits.startsWith("9")) return "";
  return `+63${digits}`;
}

export function isValidPhilippinePhone(value) {
  return Boolean(normalizePhilippinePhone(value));
}
