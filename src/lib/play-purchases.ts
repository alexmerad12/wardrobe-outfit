// Google Play purchases, the part that runs in the Android app's page.
//
// The paywall inside the app sells through Google Play (Google forbids any
// other payment in an app), with RevenueCat's Capacitor plugin. Like every
// plugin it is reached through window.Capacitor.Plugins, nothing of it is
// bundled in the site, and every method is checked before it is called
// (src/lib/native-shell.ts). Browser only: call these from an effect or an
// event handler, never during render.
//
// The customer id at RevenueCat is ALWAYS the Supabase user id: that is how
// the server finds the account a purchase belongs to (play-billing.ts).
import { savePercent, trialDaysFromPeriod } from "./play-billing";
import { shellPlugins, type PlayPackage, type ShellPlugins } from "./native-shell";

type Purchases = NonNullable<ShellPlugins["Purchases"]>;

/** RevenueCat's PUBLIC key for the Google Play app ("goog_..."). Public by
 *  design (it ships in every app); the secret key stays on the server. */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

export type PlayPlan = {
  /** Handed back to the plugin to buy this plan. */
  pkg: PlayPackage;
  /** The price as Google Play formats it for this person ("CA$6.99"). */
  price: string;
  /** The price of one week, for the annual plan's "that is X a week". */
  perWeek: string | null;
  /** Days of free trial Google offers THIS person, null when none. */
  trialDays: number | null;
};

export type PlayPlans = {
  weekly: PlayPlan | null;
  annual: PlayPlan | null;
  /** "Save N%" of the annual plan against 52 weeks, null when unknown. */
  savePercent: number | null;
};

/** The store can't be used: an app too old to carry the plugin, or a build
 *  of the site without the public key. The paywall then says so. */
export class PlayStoreUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PlayStoreUnavailable";
  }
}

function plugin(): Purchases {
  const purchases = shellPlugins()?.Purchases;
  if (!purchases?.configure || !purchases.getOfferings || !purchases.purchasePackage) {
    throw new PlayStoreUnavailable("the app has no purchases plugin");
  }
  if (!PUBLIC_KEY) throw new PlayStoreUnavailable("no RevenueCat key in this build");
  return purchases;
}

/** Make sure the plugin talks for THIS account before anything is read or
 *  bought: a purchase made under another id would pay for someone else. */
async function openStore(userId: string): Promise<Purchases> {
  const purchases = plugin();
  const configured = (await purchases.isConfigured?.())?.isConfigured === true;
  if (!configured) {
    await purchases.configure!({ apiKey: PUBLIC_KEY, appUserID: userId });
    return purchases;
  }
  const current = (await purchases.getAppUserID?.())?.appUserID;
  if (current !== userId) {
    if (!purchases.logIn) throw new PlayStoreUnavailable("the plugin cannot switch account");
    await purchases.logIn({ appUserID: userId });
  }
  return purchases;
}

function toPlan(pkg: PlayPackage | null | undefined): PlayPlan | null {
  const price = pkg?.product?.priceString;
  if (!pkg || !price) return null;
  return {
    pkg,
    price,
    perWeek: pkg.product?.pricePerWeekString ?? null,
    trialDays: trialDaysFromPeriod(
      pkg.product?.defaultOption?.freePhase?.billingPeriod?.iso8601,
    ),
  };
}

/** The two plans with Google Play's own prices for this person's country. */
export async function loadPlayPlans(userId: string): Promise<PlayPlans> {
  const purchases = await openStore(userId);
  const offering = (await purchases.getOfferings!())?.current;
  const weekly = toPlan(offering?.weekly);
  const annual = toPlan(offering?.annual);
  if (!weekly && !annual) throw new PlayStoreUnavailable("Google Play returned no plan");
  return {
    weekly,
    annual,
    savePercent:
      weekly && annual
        ? savePercent(weekly.pkg.product?.price ?? 0, annual.pkg.product?.price ?? 0)
        : null,
  };
}

/** RevenueCat's code for "the person closed Google's sheet". The plugin's
 *  own wrapper would flag it; called directly, the code is all there is. */
function isCancelled(err: unknown): boolean {
  const error = err as { code?: unknown; userCancelled?: unknown; data?: { code?: unknown } };
  if (error?.userCancelled === true) return true;
  return String(error?.code ?? error?.data?.code ?? "") === "1";
}

/** Open Google Play's purchase sheet for a plan. */
export async function buyPlayPlan(
  userId: string,
  plan: PlayPlan,
): Promise<"bought" | "cancelled"> {
  const purchases = await openStore(userId);
  try {
    await purchases.purchasePackage!({ aPackage: plan.pkg });
    return "bought";
  } catch (err) {
    if (isCancelled(err)) return "cancelled";
    throw err;
  }
}

/** "Restore purchase": ask Google Play what this Google account already
 *  bought and attach it to this Linette account. */
export async function restorePlayPurchases(userId: string): Promise<void> {
  const purchases = await openStore(userId);
  if (!purchases.restorePurchases) {
    throw new PlayStoreUnavailable("the plugin cannot restore");
  }
  await purchases.restorePurchases();
}

/** Have the server re-read this account at RevenueCat and write its
 *  subscription. True when the account has access afterwards. */
export async function syncPlayAccess(): Promise<boolean> {
  const res = await fetch("/api/play/sync", { method: "POST" });
  if (!res.ok) throw new Error(`sync answered ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as { active?: unknown };
  return body.active === true;
}
