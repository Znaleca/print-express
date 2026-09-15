export const PRODUCT_SERVICE_OPTIONS = [
  "Digital and document printing",
  "Business cards and flyers",
  "Posters and large-format printing",
  "Tarpaulins and banners",
  "Photo printing",
  "Stickers and labels",
  "Invitations and event materials",
  "ID, passport, and studio photos",
  "Photocopying and scanning",
  "Binding and lamination",
  "Graphic design and layout",
  "Computer services and internet access",
  "Other",
];

export function formatProductServiceSummary(selectedServices, otherService = "") {
  return [
    ...selectedServices.filter((service) => service !== "Other"),
    ...(selectedServices.includes("Other") && otherService.trim()
      ? [`Other: ${otherService.trim()}`]
      : []),
  ].join(", ");
}

export function parseProductServiceSummary(summary) {
  const entries = String(summary || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const standardOptions = new Set(PRODUCT_SERVICE_OPTIONS.filter((service) => service !== "Other"));
  const selectedServices = entries.filter((entry) => standardOptions.has(entry));
  const otherEntries = entries
    .filter((entry) => !standardOptions.has(entry))
    .map((entry) => entry.replace(/^Other:\s*/i, "").trim())
    .filter(Boolean);

  if (otherEntries.length > 0) selectedServices.push("Other");
  return { selectedServices, otherService: otherEntries.join(", ") };
}
