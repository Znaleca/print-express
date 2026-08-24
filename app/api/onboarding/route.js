import { NextResponse } from "next/server";
import {
  callOnboardingRpc,
  getOnboardingContext,
  normalizeCurrentStep,
  normalizeStatus,
  normalizeTutorialVersion,
  OnboardingRequestError,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

function jsonError(error) {
  const status = error instanceof OnboardingRequestError ? error.status : 500;
  const message = error instanceof OnboardingRequestError
    ? error.message
    : "Unable to process your onboarding request.";

  if (status >= 500) {
    console.error("ONBOARDING_API_ERROR:", error);
  }

  return NextResponse.json({ error: message }, { status });
}

function successResponse(context, state) {
  return NextResponse.json({
    success: true,
    role: context.role,
    state,
  });
}

export async function GET(request) {
  try {
    const context = await getOnboardingContext(request);
    const version = normalizeTutorialVersion(new URL(request.url).searchParams.get("version"));
    const state = await callOnboardingRpc(context, "get_my_onboarding_state", {
      p_role: context.role,
      p_tutorial_version: version,
    });

    return successResponse(context, state);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const context = await getOnboardingContext(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const version = normalizeTutorialVersion(body?.tutorialVersion);

    if (action === "initialize") {
      const state = await callOnboardingRpc(context, "get_or_create_my_onboarding_state", {
        p_role: context.role,
        p_tutorial_version: version,
      });
      return successResponse(context, state);
    }

    if (action === "restart") {
      const state = await callOnboardingRpc(context, "restart_my_onboarding", {
        p_role: context.role,
        p_tutorial_version: version,
      });
      return successResponse(context, state);
    }

    throw new OnboardingRequestError(
      "Unsupported onboarding action.",
      400,
      "UNSUPPORTED_ONBOARDING_ACTION"
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request) {
  try {
    const context = await getOnboardingContext(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "save").trim().toLowerCase();
    const version = normalizeTutorialVersion(body?.tutorialVersion);

    const statusByAction = {
      save: normalizeStatus(body?.status),
      start: "IN_PROGRESS",
      complete: "COMPLETED",
      skip: "SKIPPED",
    };
    if (!Object.prototype.hasOwnProperty.call(statusByAction, action)) {
      throw new OnboardingRequestError(
        "Unsupported onboarding update.",
        400,
        "UNSUPPORTED_ONBOARDING_UPDATE"
      );
    }

    const state = await callOnboardingRpc(context, "save_my_onboarding_progress", {
      p_role: context.role,
      p_tutorial_version: version,
      p_current_step: normalizeCurrentStep(body?.currentStep),
      p_status: statusByAction[action],
    });

    return successResponse(context, state);
  } catch (error) {
    return jsonError(error);
  }
}

