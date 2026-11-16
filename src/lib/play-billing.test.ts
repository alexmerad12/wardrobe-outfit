import { describe, expect, it } from "vitest";
import {
  isUuid,
  mayOverwrite,
  planFromPlayProduct,
  playStateFromSubscriber,
  savePercent,
  trialDaysFromPeriod,
  userIdsFromEvent,
  type RcSubscriber,
} from "./play-billing";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const USER = "3f0c1a52-9a7e-4a57-9d0f-6d1c2b3a4e5f";
const OTHER = "0b9d7c1e-2f3a-4b5c-8d6e-7f8a9b0c1d2e";

function subscriber(
  entitlement: Record<string, unknown> | null,
  subscription: Record<string, unknown> = {},
): RcSubscriber {
  return {
    entitlements: entitlement ? { premium: entitlement } : {},
    subscriptions: { linette_premium: { store: "play_store", ...subscription } },
  };
}

describe("planFromPlayProduct", () => {
  it("reads the base plan after the colon", () => {
    expect(planFromPlayProduct("linette_premium:weekly")).toBe("weekly");
    expect(planFromPlayProduct("linette_premium:annual")).toBe("annual");
    expect(planFromPlayProduct("linette_premium:annual-2027")).toBe("annual");
  });
  it("does not take the period from the subscription's own name", () => {
    // "weekly_club:annual" is the annual plan of a product named weekly_club.
    expect(planFromPlayProduct("weekly_club:annual")).toBe("annual");
  });
  it("reads a product without a base plan, and gives up on anything else", () => {
    expect(planFromPlayProduct("linette_weekly")).toBe("weekly");
    expect(planFromPlayProduct("linette_premium:monthly")).toBeNull();
    expect(planFromPlayProduct(null)).toBeNull();
  });
});

describe("playStateFromSubscriber", () => {
  it("is nothing without the entitlement, whatever was bought", () => {
    expect(playStateFromSubscriber(subscriber(null), "premium", NOW)).toEqual({ kind: "none" });
    expect(playStateFromSubscriber(null, "premium", NOW)).toEqual({ kind: "none" });
    // The entitlement exists under another name: still nothing.
    expect(
      playStateFromSubscriber(
        subscriber({ expires_date: "2026-12-01T00:00:00Z", product_identifier: "linette_premium" }),
        "pro",
        NOW,
      ),
    ).toEqual({ kind: "none" });
  });

  it("reads a free trial", () => {
    const state = playStateFromSubscriber(
      subscriber(
        { expires_date: "2026-11-20T12:00:00Z", product_identifier: "linette_premium" },
        {
          period_type: "trial",
          product_plan_identifier: "weekly",
          store_transaction_id: "GPA.3309-9122-6177-45730",
        },
      ),
      "premium",
      NOW,
    );
    expect(state).toEqual({
      kind: "subscription",
      active: true,
      status: "trialing",
      plan: "weekly",
      storeProductId: "linette_premium:weekly",
      storeTransactionId: "GPA.3309-9122-6177-45730",
      periodEnd: "2026-11-20T12:00:00.000Z",
      endsInsteadOfRenewing: false,
    });
  });

  it("reads a paid year that the person cancelled: active until the end", () => {
    const state = playStateFromSubscriber(
      subscriber(
        { expires_date: "2027-11-01T00:00:00Z", product_identifier: "linette_premium" },
        {
          period_type: "normal",
          product_plan_identifier: "annual",
          unsubscribe_detected_at: "2026-11-10T00:00:00Z",
        },
      ),
      "premium",
      NOW,
    );
    expect(state).toMatchObject({
      active: true,
      status: "active",
      plan: "annual",
      endsInsteadOfRenewing: true,
    });
  });

  it("ends when the date has passed", () => {
    const state = playStateFromSubscriber(
      subscriber({ expires_date: "2026-11-13T11:59:59Z", product_identifier: "linette_premium" }),
      "premium",
      NOW,
    );
    expect(state).toMatchObject({ active: false, status: "canceled" });
  });

  it("stays active through Google's grace period, then reads as a failed payment", () => {
    const inGrace = playStateFromSubscriber(
      subscriber(
        {
          expires_date: "2026-11-12T00:00:00Z",
          grace_period_expires_date: "2026-11-15T00:00:00Z",
          product_identifier: "linette_premium",
        },
        { billing_issues_detected_at: "2026-11-12T00:00:00Z" },
      ),
      "premium",
      NOW,
    );
    expect(inGrace).toMatchObject({
      active: true,
      status: "active",
      periodEnd: "2026-11-15T00:00:00.000Z",
    });

    const after = playStateFromSubscriber(
      subscriber(
        { expires_date: "2026-11-12T00:00:00Z", product_identifier: "linette_premium" },
        { billing_issues_detected_at: "2026-11-12T00:00:00Z" },
      ),
      "premium",
      NOW,
    );
    expect(after).toMatchObject({ active: false, status: "past_due" });
  });

  it("a refund ends access even if the date is in the future", () => {
    const state = playStateFromSubscriber(
      subscriber(
        { expires_date: "2026-12-01T00:00:00Z", product_identifier: "linette_premium" },
        { refunded_at: "2026-11-13T10:00:00Z", billing_issues_detected_at: "2026-11-01T00:00:00Z" },
      ),
      "premium",
      NOW,
    );
    expect(state).toMatchObject({ active: false, status: "canceled" });
  });

  it("an entitlement with no end date (granted by hand) is active with no date", () => {
    const state = playStateFromSubscriber(
      {
        entitlements: { premium: { expires_date: null, product_identifier: "rc_promo_premium_lifetime" } },
        subscriptions: {},
      },
      "premium",
      NOW,
    );
    expect(state).toMatchObject({ active: true, status: "active", periodEnd: null, plan: null });
  });
});

describe("userIdsFromEvent", () => {
  it("keeps the Supabase ids and drops RevenueCat's anonymous ones", () => {
    expect(
      userIdsFromEvent({
        type: "RENEWAL",
        app_user_id: USER.toUpperCase(),
        original_app_user_id: "$RCAnonymousID:8069238d6049ce87cc529853916d624c",
        aliases: [USER, "$RCAnonymousID:8069238d6049ce87cc529853916d624c"],
      }),
    ).toEqual([USER]);
  });
  it("names both sides of a transfer", () => {
    expect(
      userIdsFromEvent({ type: "TRANSFER", transferred_from: [USER], transferred_to: [OTHER] }),
    ).toEqual([USER, OTHER]);
  });
  it("is nobody for the dashboard's test event or a broken body", () => {
    expect(userIdsFromEvent({ type: "TEST", app_user_id: "1234567890" })).toEqual([]);
    expect(userIdsFromEvent(null)).toEqual([]);
    expect(userIdsFromEvent({ aliases: "not-a-list" })).toEqual([]);
  });
  it("knows a UUID", () => {
    expect(isUuid(USER)).toBe(true);
    expect(isUuid(`${USER}x`)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe("mayOverwrite", () => {
  it("lets a seller write its own row and a first row", () => {
    expect(mayOverwrite(null, { source: "play", active: false })).toBe(true);
    expect(mayOverwrite({ source: "play", status: "active" }, { source: "play", active: false })).toBe(true);
    // Rows from before the column existed are Stripe's.
    expect(mayOverwrite({ status: "active" }, { source: "stripe", active: false })).toBe(true);
  });
  it("keeps an active row safe from the other seller's ended subscription", () => {
    expect(mayOverwrite({ source: "play", status: "active" }, { source: "stripe", active: false })).toBe(false);
    expect(mayOverwrite({ source: "stripe", status: "trialing" }, { source: "play", active: false })).toBe(false);
  });
  it("lets the other seller take over a row that grants nothing, or with an active subscription", () => {
    expect(mayOverwrite({ source: "stripe", status: "canceled" }, { source: "play", active: false })).toBe(true);
    expect(mayOverwrite({ source: "stripe", status: "past_due" }, { source: "play", active: true })).toBe(true);
    expect(mayOverwrite({ source: "stripe", status: "active" }, { source: "play", active: true })).toBe(true);
  });
});

describe("what the paywall shows in the app", () => {
  it("counts the days of a free trial", () => {
    expect(trialDaysFromPeriod("P7D")).toBe(7);
    expect(trialDaysFromPeriod("P1W")).toBe(7);
    expect(trialDaysFromPeriod("P2W")).toBe(14);
    expect(trialDaysFromPeriod("P1W3D")).toBe(10);
    expect(trialDaysFromPeriod("P1M")).toBeNull();
    expect(trialDaysFromPeriod(null)).toBeNull();
    expect(trialDaysFromPeriod("P0D")).toBeNull();
  });
  it("works out the saving of a year against 52 weeks", () => {
    expect(savePercent(6.99, 79.99)).toBe(78);
    expect(savePercent(4.99, 59.99)).toBe(77);
    // No saving, or a missing price: no badge.
    expect(savePercent(1, 60)).toBeNull();
    expect(savePercent(0, 79.99)).toBeNull();
  });
});
