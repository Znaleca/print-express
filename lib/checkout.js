export function getDesignFiles(item) {
  if (Array.isArray(item?.designFiles) && item.designFiles.length > 0) return item.designFiles;
  if (item?.designUrl) return [{ url: item.designUrl, name: item.designFileName || "Design file" }];
  return [];
}

export function getCartGroups(items = []) {
  return [
    {
      key: "quotes",
      label: "Accepted service quotes",
      items: items.filter((item) => item.item_type !== "product" && item.isQuotedCheckout),
    },
    {
      key: "products",
      label: "Products",
      items: items.filter((item) => item.item_type === "product"),
    },
  ].filter((group) => group.items.length > 0);
}
