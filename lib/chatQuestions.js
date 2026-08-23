export const MAX_SHOP_QUESTIONS = 10;
export const MAX_QUESTION_LABEL_LENGTH = 48;
export const MAX_QUESTION_TEXT_LENGTH = 320;

const shorten = (value, maxLength = 25) => {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
};

export function buildDefaultShopQuestions(business) {
  const shopName = business?.name || "your shop";
  const availableItems = (business?.services || []).filter((item) => item?.available !== false);
  const featuredItem = availableItems[0];
  const featuredName = featuredItem?.name ? shorten(featuredItem.name) : "my print job";
  const hasCustomServices = availableItems.some((item) => item.item_type !== "product" || item.is_customizable);

  return [
    {
      key: "catalog",
      label: "What do you offer?",
      customerText: `Hi! What printing services and products are currently available at ${shopName}?`,
    },
    {
      key: "quote",
      label: featuredItem ? `Price for ${featuredName}` : "Ask for a quote",
      customerText: featuredItem
        ? `Could you give me an estimate for ${featuredItem.name}? Please include the available options, minimum quantity, and expected turnaround.`
        : "Could you give me a quote? I can send the size, quantity, material, and deadline so you can price it accurately.",
    },
    {
      key: "options",
      label: "Ask about options",
      customerText: featuredItem
        ? `For ${featuredItem.name}, what sizes, materials, finishes, and quality options do you currently offer? Please include any added costs.`
        : "What sizes, materials, finishes, and quality options do you currently offer, and what does each option cost?",
    },
    {
      key: "file_check",
      label: hasCustomServices ? "Check my design file" : "Can you check my file?",
      customerText: "Can you check my PDF or image for size, resolution, bleed, margins, and print-readiness before I order?",
    },
    {
      key: "turnaround",
      label: "Ask about turnaround",
      customerText: "What is the current turnaround for my print job? I can provide the quantity, specifications, and the date I need it.",
    },
    {
      key: "fulfillment",
      label: "Pickup or delivery?",
      customerText: "Do you offer pickup or delivery? Please share the available area, delivery fee, and estimated delivery time.",
    },
    {
      key: "file_format",
      label: "Which file format?",
      customerText: "Which file formats do you accept for this job, and should I convert fonts, colors, or images before uploading?",
    },
    {
      key: "proof",
      label: "Request a digital proof",
      customerText: "Can you send a digital proof showing the layout, colors, and finishing details for my approval before printing?",
    },
    {
      key: "urgent",
      label: "Same-day printing?",
      customerText: "Do you offer same-day or rush printing for this job? Please tell me the cutoff time and any rush fee.",
    },
    {
      key: "bulk",
      label: "Bulk quantity discount?",
      customerText: "Is there a quantity discount for a bulk order? Please share the price breaks and minimum quantity.",
    },
  ];
}

export function normalizeShopQuestions(value) {
  if (!Array.isArray(value)) return [];

  const usedKeys = new Set();
  return value.slice(0, MAX_SHOP_QUESTIONS).flatMap((question, index) => {
    const label = String(question?.label || "").trim().slice(0, MAX_QUESTION_LABEL_LENGTH);
    const customerText = String(question?.customerText || question?.question || "")
      .trim()
      .slice(0, MAX_QUESTION_TEXT_LENGTH);
    if (!label || !customerText) return [];

    const baseKey = String(question?.key || `custom-${index + 1}`)
      .trim()
      .replace(/[^a-z0-9_-]/gi, "-")
      .slice(0, 64) || `custom-${index + 1}`;
    let key = baseKey;
    let duplicateIndex = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}-${duplicateIndex}`;
      duplicateIndex += 1;
    }
    usedKeys.add(key);

    return [{ key, label, customerText }];
  });
}

export function getShopQuestions(business) {
  const customQuestions = normalizeShopQuestions(business?.chat_suggested_questions);
  return customQuestions.length > 0 ? customQuestions : buildDefaultShopQuestions(business);
}
