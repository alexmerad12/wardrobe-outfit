import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, checkoutTrialDays } from "./checkout-trial";

// The owner's call of 2026-11-26: the website's free trial is on the yearly
// plan only, once per person (until then it was on the weekly plan).
describe("checkoutTrialDays", () => {
  it("gives the yearly plan its 7 free days on a first subscription", () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(checkoutTrialDays("annual", true)).toBe(7);
  });

  it("gives no second trial on the yearly plan", () => {
    expect(checkoutTrialDays("annual", false)).toBeNull();
  });

  it("never gives the weekly plan a trial, first subscription or not", () => {
    expect(checkoutTrialDays("weekly", true)).toBeNull();
    expect(checkoutTrialDays("weekly", false)).toBeNull();
  });
});
