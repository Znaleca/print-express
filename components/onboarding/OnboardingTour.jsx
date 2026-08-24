"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import OnboardingDialog from "@/components/onboarding/OnboardingDialog";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function findTarget(selector) {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

export default function OnboardingTour({
  isOpen,
  step,
  stepIndex,
  stepCount,
  isBusy,
  error,
  onClose,
  onBack,
  onNext,
  onSkip,
}) {
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [targetRect, setTargetRect] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!isOpen || !step) return undefined;

    restoreFocusRef.current = document.activeElement;
    let animationFrame;

    const measure = () => {
      const target = findTarget(step.target);
      const rect = target?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        setTargetRect(null);
      } else {
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
          right: rect.right,
        });
      }
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(scheduleMeasure)
      : null;
    const target = findTarget(step.target);
    observer?.observe(target || document.body);

    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(focusTimer);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      observer?.disconnect();
      const previous = restoreFocusRef.current;
      if (previous && typeof previous.focus === "function" && document.contains(previous)) previous.focus();
    };
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isBusy) onClose();
        return;
      }

      if (event.key === "ArrowRight" && !isBusy) {
        event.preventDefault();
        onNext();
        return;
      }

      if (event.key === "ArrowLeft" && !isBusy) {
        event.preventDefault();
        onBack();
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )];
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isBusy, onBack, onClose, onNext]);

  if (!mounted || !isOpen || !step || typeof document === "undefined") return null;

  const hasTarget = Boolean(targetRect);
  const dialogWidth = Math.min(400, window.innerWidth - 32);
  const dialogHeightEstimate = 300;
  const dialogLeft = hasTarget
    ? clamp(targetRect.left, 16, Math.max(16, window.innerWidth - dialogWidth - 16))
    : Math.max(16, (window.innerWidth - dialogWidth) / 2);
  const roomBelow = hasTarget && window.innerHeight - targetRect.bottom >= dialogHeightEstimate + 24;
  const dialogTop = hasTarget
    ? roomBelow
      ? targetRect.bottom + 20
      : Math.max(16, targetRect.top - dialogHeightEstimate - 20)
    : Math.max(16, (window.innerHeight - dialogHeightEstimate) / 2);

  return createPortal(
    <div className="onboarding-layer" aria-label="Press & Present tutorial">
      {hasTarget ? (
        <div
          className="onboarding-spotlight"
          aria-hidden="true"
          style={{
            top: `${Math.max(0, targetRect.top - 8)}px`,
            left: `${Math.max(0, targetRect.left - 8)}px`,
            width: `${targetRect.width + 16}px`,
            height: `${targetRect.height + 16}px`,
          }}
        />
      ) : (
        <div className="onboarding-backdrop" aria-hidden="true" />
      )}
      <div
        className="onboarding-dialog-positioner"
        style={{
          top: `${dialogTop}px`,
          left: `${dialogLeft}px`,
          width: `${dialogWidth}px`,
        }}
      >
        <OnboardingDialog
          dialogRef={dialogRef}
          titleId={`onboarding-title-${step.id || stepIndex}`}
          descriptionId={`onboarding-description-${step.id || stepIndex}`}
          step={step}
          stepIndex={stepIndex}
          stepCount={stepCount}
          isTargetMissing={!hasTarget}
          isBusy={isBusy}
          error={error}
          onClose={onClose}
          onBack={onBack}
          onNext={onNext}
          onSkip={onSkip}
        />
      </div>
    </div>,
    document.body
  );
}
