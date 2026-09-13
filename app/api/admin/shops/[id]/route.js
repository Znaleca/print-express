import { GET as getShopDirectory } from "@/app/api/admin/shops/route";

export async function GET(request, context) {
  const params = await context.params;
  const url = new URL(request.url);
  url.searchParams.set("shopId", String(params?.id || ""));
  url.searchParams.set("page", "1");
  return getShopDirectory(new Request(url, { method: "GET", headers: request.headers }));
}
