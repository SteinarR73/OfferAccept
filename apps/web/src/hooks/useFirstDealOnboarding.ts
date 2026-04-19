'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const DISMISSED_KEY = 'oa_onboarding_dismissed';
const STEP_KEY      = 'oa_onboarding_step';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Options {
  offerCount: number;
  loading?: boolean;
}

export interface UseFirstDealOnboardingReturn {
  /** True when the user has never sent a deal (offerCount === 0). */
  isFirstDealUser: boolean;
  /** True after the user explicitly closes the welcome modal. */
  dismissedOnboarding: boolean;
  /** 1-indexed panel (1–3) the modal should show. */
  currentStep: number;
  /** Show the full 3-panel welcome modal. */
  showModal: boolean;
  /** Show the compact nudge banner (modal was dismissed but no deal sent yet). */
  showBanner: boolean;
  dismiss: () => void;
  setStep: (step: number) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFirstDealOnboarding({
  offerCount,
  loading = false,
}: Options): UseFirstDealOnboardingReturn {
  // Guard against SSR/hydration mismatch — do not read localStorage until mounted.
  const [hydrated, setHydrated]     = useState(false);
  const [dismissed, setDismissed]   = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');

    const raw = parseInt(localStorage.getItem(STEP_KEY) ?? '1', 10);
    setCurrentStep(Number.isNaN(raw) ? 1 : Math.min(Math.max(raw, 1), 3));

    setHydrated(true);
  }, []);

  const isFirstDealUser = !loading && offerCount === 0;

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  }, []);

  const setStep = useCallback((s: number) => {
    const clamped = Math.min(Math.max(s, 1), 3);
    setCurrentStep(clamped);
    localStorage.setItem(STEP_KEY, String(clamped));
  }, []);

  // Suppress both UI elements until client-side hydration is complete to
  // avoid a flash of the modal on users who already dismissed it.
  const showModal  = hydrated && isFirstDealUser && !dismissed;
  const showBanner = hydrated && isFirstDealUser && dismissed;

  return {
    isFirstDealUser,
    dismissedOnboarding: dismissed,
    currentStep,
    showModal,
    showBanner,
    dismiss,
    setStep,
  };
}
