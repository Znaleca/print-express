import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const STORAGE_REF_PATTERN = /^(private-assets|business-documents):(.+)$/i;
const STORAGE_URL_PATTERN = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i;

function getBearerToken(request) {
  return (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function getOwnedStorageRef(value, userId, businessId) {
  const source = String(value || "");
  const reference = source.match(STORAGE_REF_PATTERN) || source.match(STORAGE_URL_PATTERN);
  if (!reference) return null;

  const bucket = reference[1].toLowerCase();
  if (!["private-assets", "business-documents"].includes(bucket)) return null;
  let filePath = reference[2];
  try {
    filePath = decodeURIComponent(filePath.split("?")[0]);
  } catch {
    return null;
  }

  const allowedPath = bucket.toLowerCase() === "private-assets"
    ? filePath.startsWith(`documents/${userId}/`)
    : filePath.startsWith(`${userId}/`) || filePath.startsWith(`${businessId}/`);
  return allowedPath ? { bucket, filePath } : null;
}

export async function DELETE(request) {
  try {
    const token = getBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabaseAdminClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const businessId = String(body.businessId || "").trim();
    const documentId = String(body.documentId || "").trim();
    if (!businessId || !documentId) {
      return NextResponse.json({ error: "INVALID_DOCUMENT_TARGET" }, { status: 400 });
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });

    const { data: document, error: documentError } = await supabase
      .from("business_documents")
      .select("id, business_id, status, file_url")
      .eq("id", documentId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (documentError) throw documentError;
    if (!document) return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
    if (String(document.status || "").toUpperCase() === "APPROVED") {
      return NextResponse.json({ error: "DOCUMENT_LOCKED" }, { status: 409 });
    }

    const storageRef = getOwnedStorageRef(document.file_url, user.id, businessId);
    if (document.file_url && !storageRef) {
      return NextResponse.json({ error: "DOCUMENT_STORAGE_REFERENCE_INVALID" }, { status: 409 });
    }

    if (storageRef) {
      const { error: storageError } = await supabase.storage
        .from(storageRef.bucket)
        .remove([storageRef.filePath]);
      if (storageError) return NextResponse.json({ error: "DOCUMENT_FILE_REMOVE_FAILED" }, { status: 502 });
    }

    const { data: deletedDocument, error: deleteError } = await supabase
      .from("business_documents")
      .delete()
      .eq("id", documentId)
      .eq("business_id", businessId)
      .select("id")
      .maybeSingle();
    if (deleteError) throw deleteError;
    if (!deletedDocument) return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });

    return NextResponse.json({ success: true, documentId });
  } catch (error) {
    console.error("OWNER_DOCUMENT_DELETE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "DOCUMENT_REMOVE_FAILED" }, { status: 500 });
  }
}
