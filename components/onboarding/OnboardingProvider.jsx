"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onboardingRequest } from "@/lib/onboardingClient";
import OnboardingTour from "@/components/onboarding/OnboardingTour";

const OnboardingContext = createContext(null);

function clampStep(value, count) {
  return Math.min(Math.max(Number(value) || 0, 0), Math.max(0, count - 1));
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return context;
}

export function useOptionalOnboarding() {
  return useContext(OnboardingContext);
}

export default function OnboardingProvider({
  role,
  steps = [],
  tutorialVersion = "v2",
  enabled = true,
  autoStart = true,
  children,
}) {
  const [state, setState] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const persist = useCallback(async (action, currentStep, status) => {
    setIsBusy(true);
    setError("");
    try {
      const result = await onboardingRequest("PATCH", {
        action,
        currentStep,
        ...(status ? { status } : {}),
      }, tutorialVersion);
      setState(result.state || null);
      return result.state || null;
    } catch (requestError) {
      setError(requestError.message || "Unable to save tutorial progress.");
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [tutorialVersion]);

  const close = useCallback(() => {
    if (!isBusy) setIsOpen(false);
  }, [isBusy]);

  const next = useCallback(async () => {
    if (!steps.length || isBusy) return;
    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      await persist("complete", steps.length - 1);
      setIsOpen(false);
      return;
    }
    await persist("save", nextIndex, "IN_PROGRESS");
    setStepIndex(nextIndex);
  }, [isBusy, persist, stepIndex, steps]);

  const back = useCallback(async () => {
    if (stepIndex <= 0 || isBusy) return;
    const previousIndex = stepIndex - 1;
    await persist("save", previousIndex, "IN_PROGRESS");
    setStepIndex(previousIndex);
  }, [isBusy, persist, stepIndex]);

  const skip = useCallback(async () => {
    if (isBusy) return;
    await persist("skip", stepIndex);
    setIsOpen(false);
  }, [isBusy, persist, stepIndex]);

  const restart = useCallback(async () => {
    setIsBusy(true);
    setError("");
    try {
      const result = await onboardingRequest("POST", { action: "restart" }, tutorialVersion);
      setState(result.state || null);
      setStepIndex(0);
      setIsOpen(true);
    } catch (requestError) {
      setError(requestError.message || "Unable to restart the tutorial.");
      throw requestError;
    } finally {
      setIsBusy(false);
    }
  }, [tutorialVersion]);

  useEffect(() => {
    if (!enabled || !role || !steps.length) {
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const result = await onboardingRequest("GET", null, tutorialVersion);
        let nextState = result.state || null;
        if (!nextState) {
          const initialized = await onboardingRequest("POST", { action: "initialize" }, tutorialVersion);
          nextState = initialized.state || null;
        }
        if (cancelled) return;
        setState(nextState);
        setStepIndex(clampStep(nextState?.current_step, steps.length));
        setIsOpen(autoStart && !["COMPLETED", "SKIPPED"].includes(nextState?.status));
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || "Unable to load the tutorial.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [autoStart, enabled, role, steps.length, tutorialVersion]);

  const value = useMemo(() => ({
    role,
    tutorialVersion,
    state,
    stepIndex,
    currentStep: steps[stepIndex] || null,
    stepCount: steps.length,
    isOpen,
    isLoading,
    isBusy,
    error,
    open: () => setIsOpen(true),
    close,
    next,
    back,
    skip,
    restart,
  }), [back, close, error, isBusy, isLoading, isOpen, next, restart, role, skip, state, stepIndex, steps, tutorialVersion]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <OnboardingTour
        isOpen={isOpen}
        step={steps[stepIndex] || null}
        stepIndex={stepIndex}
        stepCount={steps.length}
        isBusy={isBusy}
        error={error}
        onClose={close}
        onBack={back}
        onNext={next}
        onSkip={skip}
      />
    </OnboardingContext.Provider>
  );
}
