import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("design proof versions stay numeric, linked, and previewable in chat", async () => {
  const ownerMessages = await source("app/owner/messages/page.jsx");
  const customerMessages = await source("app/messages/page.jsx");

  assert.match(ownerMessages, /const normalizeDesignVersion = \(value\) =>/);
  assert.match(ownerMessages, /const MAX_DESIGN_VERSIONS = 10/);
  assert.match(ownerMessages, /if \(!\/\^\[1-9\]\\d\*\$\//);
  assert.match(ownerMessages, /version_number: numericVersion/);
  assert.match(ownerMessages, /version: versionLabel/);
  assert.match(ownerMessages, /proof_id: proofRow\.id/);
  assert.match(ownerMessages, /message_type: 'design_version'/);
  assert.match(ownerMessages, /msg\.message_type !== 'design_version'/);
  assert.match(ownerMessages, /alt=\{`Design proof version/);
  assert.match(ownerMessages, /versionPickerMessageId/);
  assert.match(ownerMessages, /getProofsForInquiry\(scopeMessages, inquiry\.id\)/);
  assert.match(ownerMessages, /getProofsForInquiry\(scopeMessages, getInquiryForMessage\(scopeMessages, msg\)\.id\)/);
  assert.match(ownerMessages, /disabled=\{sending \|\| isUsed\}/);
  assert.match(ownerMessages, /Array\.from\(\{ length: MAX_DESIGN_VERSIONS \}/);
  assert.match(ownerMessages, /<legend className="mb-2[^>]*>Choose version · 1–10<\/legend>/);
  assert.match(ownerMessages, /aria-pressed=\{isSelected && !isUsed\}/);
  assert.match(ownerMessages, /disabled=\{sending \|\| isUsed\}/);
  assert.match(ownerMessages, /uploadMarkedVersions\.has\(Number\(designVersion\)\)/);
  assert.match(ownerMessages, /status: "APPROVED"/);
  assert.match(ownerMessages, /proof_status: "APPROVED",\s+owner_ready: true/);
  assert.match(ownerMessages, /Mark ready for customer/);
  assert.match(ownerMessages, /customerApproved = meta\.proof_status === "APPROVED" && meta\.reviewed_by === activeConv\.customer_id/);

  assert.match(customerMessages, /const normalizeDesignVersion = \(value\) =>/);
  assert.match(customerMessages, /const MAX_DESIGN_VERSIONS = 10/);
  assert.match(customerMessages, /version_number: numericVersion/);
  assert.match(customerMessages, /version: versionLabel/);
  assert.match(customerMessages, /!\["design_version", "design_upload"\]\.includes\(m\.message_type\)/);
  assert.match(customerMessages, /alt=\{`Design proof version/);
  assert.match(customerMessages, /meta\.proof_status === "APPROVED" && meta\.reviewed_by === user\.id/);
});
