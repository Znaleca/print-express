"use client";

export default function OnboardingProgress({ current, total }) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCurrent = Math.min(safeTotal, Math.max(1, Number(current) || 1));
  const percentage = (safeCurrent / safeTotal) * 100;

  return (
    <div className="onboarding-progress" aria-label={`Step ${safeCurrent} of ${safeTotal}`}>
      <div className="onboarding-progress__meta">
        <span>Getting started</span>
        <span>Step {safeCurrent} of {safeTotal}</span>
      </div>
      <div className="onboarding-progress__track" aria-hidden="true">
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

