import test from "node:test";
import assert from "node:assert/strict";
import { getInquiryForMessage, getProofsForInquiry } from "../lib/designProofScope.mjs";

test("proof versions reset for each quote request, even for the same service", () => {
  const messages = [
    { id: "request-one", message_type: "service_inquiry", created_at: "2026-09-24T10:00:00Z", metadata: { service_id: "printing" } },
    { id: "old-proof", message_type: "design_version", created_at: "2026-09-24T10:01:00Z", metadata: { proof_id: "proof-one", version: "1", service_id: "printing" } },
    { id: "request-two", message_type: "service_inquiry", created_at: "2026-09-24T11:00:00Z", metadata: { service_id: "printing" } },
    { id: "new-upload", message_type: "design_upload", created_at: "2026-09-24T11:01:00Z", metadata: { service_id: "printing" } },
    { id: "new-proof", message_type: "design_version", created_at: "2026-09-24T11:02:00Z", metadata: { proof_id: "proof-two", version: "1", inquiry_message_id: "request-two" } },
  ];

  assert.equal(getInquiryForMessage(messages, messages[3])?.id, "request-two");
  assert.deepEqual(getProofsForInquiry(messages, "request-one").map((proof) => proof.id), ["old-proof"]);
  assert.deepEqual(getProofsForInquiry(messages, "request-two").map((proof) => proof.id), ["new-proof"]);
});

test("a quote and unregistered image do not reserve a design version", () => {
  const messages = [
    { id: "request", message_type: "service_inquiry", created_at: "2026-09-24T10:00:00Z", metadata: { service_id: "printing" } },
    { id: "quote", message_type: "quote", created_at: "2026-09-24T10:01:00Z", metadata: { inquiry_message_id: "request", proof_version: "1" } },
    { id: "image", message_type: "design_version", created_at: "2026-09-24T10:02:00Z", metadata: { version: "2" } },
  ];

  assert.deepEqual(getProofsForInquiry(messages, "request"), []);
});
