"use client";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import OnboardingProgress from "@/components/onboarding/OnboardingProgress";

export default function OnboardingDialog({
  dialogRef,
  titleId,
  descriptionId,
  step,
  stepIndex,
  stepCount,
  isTargetMissing,
  isBusy,
  error,
  onClose,
  onBack,
  onNext,
  onSkip,
}) {
  const isLastStep = stepIndex === stepCount - 1;

  return (
    <section
      ref={dialogRef}
      className={`onboarding-dialog${isTargetMissing ? " onboarding-dialog--fallback" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
    >
      <div className="onboarding-dialog__accent" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <header className="onboarding-dialog__header">
        <div>
          <p className="onboarding-dialog__eyebrow">{step.eyebrow || "PRESS & PRESENT"}</p>
          <h2 id={titleId}>{step.title}</h2>
        </div>
        <button
          type="button"
          className="onboarding-dialog__close"
          onClick={onClose}
          aria-label="Close tutorial"
          disabled={isBusy}
        >
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      <div className="onboarding-dialog__body">
        <p id={descriptionId}>{step.description}</p>
        {isTargetMissing && (
          <p className="onboarding-dialog__hint" role="status">
            This part of the tutorial is not available on this screen yet. You can continue safely.
          </p>
        )}
        {error && <p className="onboarding-dialog__error" role="alert">{error}</p>}
      </div>

      <div className="onboarding-dialog__footer">
        <OnboardingProgress current={stepIndex + 1} total={stepCount} />

        <div className="onboarding-dialog__actions">
          <button type="button" className="onboarding-button onboarding-button--quiet" onClick={onSkip} disabled={isBusy}>
            Skip tutorial
          </button>
          <div className="onboarding-dialog__navigation">
            <button
              type="button"
              className="onboarding-button onboarding-button--secondary"
              onClick={onBack}
              disabled={stepIndex === 0 || isBusy}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              className="onboarding-button onboarding-button--primary"
              onClick={onNext}
              disabled={isBusy}
            >
              {isBusy ? "Saving..." : isLastStep ? "Finish" : "Next"}
              {isLastStep ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

