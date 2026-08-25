import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("onboarding uses the current v2 version by default", async () => {
  const server = await source("lib/onboarding.js");
  const client = await source("lib/onboardingClient.js");
  const provider = await source("components/onboarding/OnboardingProvider.jsx");
  const customer = await source("components/onboarding/CustomerOnboarding.jsx");
  const owner = await source("components/onboarding/OwnerOnboarding.jsx");

  assert.match(server, /DEFAULT_ONBOARDING_VERSION\s*=\s*["']v2["']/);
  assert.match(client, /version\s*=\s*["']v2["']/);
  assert.match(provider, /tutorialVersion\s*=\s*["']v2["']/);
  assert.match(customer, /tutorialVersion\s*=\s*["']v2["']/);
  assert.match(owner, /owner-verification-v2/);
  assert.match(owner, /owner-v2/);
});

test("onboarding only auto-starts on the home entry points", async () => {
  const customer = await source("components/onboarding/CustomerOnboarding.jsx");
  const owner = await source("components/onboarding/OwnerOnboarding.jsx");

  assert.match(customer, /autoStart=\{pathname\s*===\s*["']\/["']\}/);
  assert.match(owner, /pathname\s*===\s*["']\/owner\/documents["']/);
  assert.match(owner, /pathname\s*===\s*["']\/owner["']/);
});

test("skip is persisted as the permanent opt-out action", async () => {
  const dialog = await source("components/onboarding/OnboardingDialog.jsx");
  const provider = await source("components/onboarding/OnboardingProvider.jsx");
  const route = await source("app/api/onboarding/route.js");

  assert.match(dialog, /Don.t show again/);
  assert.match(provider, /persist\("skip",\s*stepIndex\)/);
  assert.match(route, /skip:\s*"SKIPPED"/);
});
