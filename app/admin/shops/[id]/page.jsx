"use client";

import { useParams } from "next/navigation";
import ShopDetailsPanel from "@/components/admin/ShopDetailsPanel";

export default function AdminShopDetailsPage() {
  const params = useParams();
  return <ShopDetailsPanel shopId={params?.id} />;
}
