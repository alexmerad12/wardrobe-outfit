import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";

// Admin-only usage dashboard. Layout already gated this — no redundant
// auth check, but we use the service-role client so we can read across
// users (auth.users + every user's ai_calls and clothing_items).
//
// All numbers are computed in JS from a single fetch per table —
// trivial at beta scale (5 users × ~30 calls/day = a few thousand
// rows). If this ever feels slow, group the queries server-side.

type AiFeature = "suggest" | "try_on" | "packing" | "analyze_item";

type AiCallRow = {
  id: string;
  user_id: string;
  feature: AiFeature;
  cost_estimate_cents: string | number;
  succeeded: boolean;
  created_at: string;
};

type ItemRow = {
  user_id: string;
  created_at: string;
};

const FEATURE_LABELS: Record<AiFeature, string> = {
  suggest: "Outfit suggest",
  try_on: "Try-on",
  packing: "Packing",
  analyze_item: "Item analyze",
};

const FEATURES: AiFeature[] = ["suggest", "try_on", "packing", "analyze_item"];

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function isToday(iso: string): boolean {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function daysAgo(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export default async function AdminPage() {
  const admin = createAdminClient();

  const [callsRes, itemsRes, usersRes] = await Promise.all([
    admin.from("ai_calls").select("id, user_id, feature, cost_estimate_cents, succeeded, created_at"),
    admin.from("clothing_items").select("user_id, created_at"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const calls = ((callsRes.data ?? []) as AiCallRow[]).map((r) => ({
    ...r,
    cost_estimate_cents:
      typeof r.cost_estimate_cents === "string"
        ? parseFloat(r.cost_estimate_cents)
        : r.cost_estimate_cents,
  }));
  const items = (itemsRes.data ?? []) as ItemRow[];
  const users = usersRes.data?.users ?? [];

  // Top-line numbers
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const callsThisMonth = calls.filter(
    (c) => new Date(c.created_at) >= monthStart
  );
  const costMtdCents = callsThisMonth.reduce(
    (sum, c) => sum + Number(c.cost_estimate_cents),
    0
  );
  const costAllTimeCents = calls.reduce(
    (sum, c) => sum + Number(c.cost_estimate_cents),
    0
  );

  const activeUsersThisWeek = new Set(
    calls.filter((c) => daysAgo(c.created_at) < 7).map((c) => c.user_id)
  ).size;

  // Project monthly cost: extrapolate from MTD pace
  const dayOfMonth = new Date().getDate();
  const projectedMonthCents =
    dayOfMonth > 0 ? (costMtdCents / dayOfMonth) * 30 : 0;

  // Per-feature breakdown
  const perFeature = FEATURES.map((feature) => {
    const featureCalls = calls.filter((c) => c.feature === feature);
    const today = featureCalls.filter((c) => isToday(c.created_at)).length;
    const week = featureCalls.filter((c) => daysAgo(c.created_at) < 7).length;
    const failed = featureCalls.filter((c) => !c.succeeded).length;
    const cost = featureCalls.reduce(
      (sum, c) => sum + Number(c.cost_estimate_cents),
      0
    );
    return {
      feature,
      today,
      week,
      total: featureCalls.length,
      failed,
      avgPerUser: users.length > 0 ? featureCalls.length / users.length : 0,
      cost,
    };
  });

  // Per-user table
  const perUser = users
    .map((u) => {
      const userCalls = calls.filter((c) => c.user_id === u.id);
      const userItems = items.filter((i) => i.user_id === u.id);
      const userCallsMtd = userCalls.filter(
        (c) => new Date(c.created_at) >= monthStart
      );
      const cost = userCallsMtd.reduce(
        (sum, c) => sum + Number(c.cost_estimate_cents),
        0
      );
      const counts = (feat: AiFeature, scope: "today" | "week" | "total") => {
        const subset = userCalls.filter((c) => c.feature === feat);
        if (scope === "today") return subset.filter((c) => isToday(c.created_at)).length;
        if (scope === "week") return subset.filter((c) => daysAgo(c.created_at) < 7).length;
        return subset.length;
      };
      return {
        id: u.id,
        email: u.email ?? "(no email)",
        items: userItems.length,
        suggestsToday: counts("suggest", "today"),
        suggestsWeek: counts("suggest", "week"),
        tryOnWeek: counts("try_on", "week"),
        packingTotal: counts("packing", "total"),
        analyzeTotal: counts("analyze_item", "total"),
        costMtd: cost,
        lastSeen: userCalls.length
          ? userCalls
              .map((c) => c.created_at)
              .sort()
              .reverse()[0]
          : null,
      };
    })
    .sort((a, b) => b.costMtd - a.costMtd);

  // Items upload stats
  const itemCountsPerUser = users.map(
    (u) => items.filter((i) => i.user_id === u.id).length
  );
  const avgItems =
    itemCountsPerUser.length > 0
      ? itemCountsPerUser.reduce((a, b) => a + b, 0) / itemCountsPerUser.length
      : 0;

  // 7-day stacked bars (today on the right)
  const days = Array.from({ length: 7 }, (_, i) => 6 - i);
  const today = new Date().toISOString().slice(0, 10);
  const dayBuckets = days.map((d) => {
    const target = new Date();
    target.setDate(target.getDate() - d);
    const key = target.toISOString().slice(0, 10);
    const dayCalls = calls.filter((c) => c.created_at.slice(0, 10) === key);
    const counts = FEATURES.reduce(
      (acc, f) => ({ ...acc, [f]: dayCalls.filter((c) => c.feature === f).length }),
      {} as Record<AiFeature, number>
    );
    return { date: key, total: dayCalls.length, counts, isToday: key === today };
  });
  const maxDay = Math.max(1, ...dayBuckets.map((d) => d.total));

  // Color per feature for the chart
  const featureColor: Record<AiFeature, string> = {
    suggest: "bg-primary",
    try_on: "bg-blue-500",
    packing: "bg-amber-500",
    analyze_item: "bg-emerald-500",
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 pb-12 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/profile" className="rounded-full p-2 hover:bg-muted" aria-label="Back to profile">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-tight">Usage & cost</h1>
          <p className="text-xs text-muted-foreground">
            {users.length} user{users.length === 1 ? "" : "s"} · {calls.length.toLocaleString()} AI calls all-time
          </p>
        </div>
      </div>

      {/* Top-line cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="editorial-label">Cost this month</p>
            <p className="text-2xl font-medium mt-1">{fmtUsd(costMtdCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="editorial-label">Projected monthly</p>
            <p className="text-2xl font-medium mt-1">{fmtUsd(projectedMonthCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="editorial-label">Cost all-time</p>
            <p className="text-2xl font-medium mt-1">{fmtUsd(costAllTimeCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="editorial-label">Active this week</p>
            <p className="text-2xl font-medium mt-1">
              {activeUsersThisWeek}
              <span className="text-sm text-muted-foreground"> / {users.length}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 7-day chart */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="editorial-label">Last 7 days · AI calls per day</p>
          <div className="flex items-end gap-2 h-32">
            {dayBuckets.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex-1 flex flex-col-reverse rounded-sm overflow-hidden bg-muted/40 relative">
                  {FEATURES.map((feat) => {
                    const count = d.counts[feat];
                    if (count === 0) return null;
                    const heightPct = (count / maxDay) * 100;
                    return (
                      <div
                        key={feat}
                        className={`${featureColor[feat]} transition-all`}
                        style={{ height: `${heightPct}%` }}
                        title={`${FEATURE_LABELS[feat]}: ${count}`}
                      />
                    );
                  })}
                </div>
                <p className={`text-[10px] ${d.isToday ? "font-semibold" : "text-muted-foreground"}`}>
                  {new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}
                </p>
                <p className="text-[10px] text-muted-foreground">{d.total}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            {FEATURES.map((feat) => (
              <div key={feat} className="flex items-center gap-1.5 text-xs">
                <span className={`h-2.5 w-2.5 rounded-sm ${featureColor[feat]}`} />
                <span>{FEATURE_LABELS[feat]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-feature breakdown */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="editorial-label">Per-feature breakdown</p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-normal">Feature</th>
                  <th className="py-2 px-3 font-normal text-right">Today</th>
                  <th className="py-2 px-3 font-normal text-right">This week</th>
                  <th className="py-2 px-3 font-normal text-right">All time</th>
                  <th className="py-2 px-3 font-normal text-right">Failed</th>
                  <th className="py-2 px-3 font-normal text-right">Avg/user</th>
                  <th className="py-2 pl-3 font-normal text-right">Total cost</th>
                </tr>
              </thead>
              <tbody>
                {perFeature.map((f) => (
                  <tr key={f.feature} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{FEATURE_LABELS[f.feature]}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{f.today}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{f.week}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{f.total}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                      {f.failed > 0 ? `${f.failed} (${Math.round((f.failed / Math.max(1, f.total)) * 100)}%)` : "—"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{f.avgPerUser.toFixed(1)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{fmtUsd(f.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Items upload stats */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="editorial-label">Wardrobe sizes</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Total items</p>
              <p className="text-lg font-medium tabular-nums">{items.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg per user</p>
              <p className="text-lg font-medium tabular-nums">{avgItems.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Median</p>
              <p className="text-lg font-medium tabular-nums">{median(itemCountsPerUser).toFixed(0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">p95</p>
              <p className="text-lg font-medium tabular-nums">{percentile(itemCountsPerUser, 95).toFixed(0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-user table */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="editorial-label">Per user (sorted by cost MTD)</p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-normal">User</th>
                  <th className="py-2 px-3 font-normal text-right">Items</th>
                  <th className="py-2 px-3 font-normal text-right">Suggests<br /><span className="text-[10px]">today / week</span></th>
                  <th className="py-2 px-3 font-normal text-right">Try-on<br /><span className="text-[10px]">week</span></th>
                  <th className="py-2 px-3 font-normal text-right">Packing<br /><span className="text-[10px]">total</span></th>
                  <th className="py-2 px-3 font-normal text-right">Analyze<br /><span className="text-[10px]">total</span></th>
                  <th className="py-2 px-3 font-normal text-right">Cost MTD</th>
                  <th className="py-2 pl-3 font-normal text-right">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {perUser.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground text-xs">
                      No users yet.
                    </td>
                  </tr>
                )}
                {perUser.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-xs truncate max-w-[180px]">{u.email}</p>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{u.items}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {u.suggestsToday} / {u.suggestsWeek}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{u.tryOnWeek}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{u.packingTotal}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{u.analyzeTotal}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtUsd(u.costMtd)}</td>
                    <td className="py-2 pl-3 text-right text-xs text-muted-foreground">
                      {u.lastSeen
                        ? new Date(u.lastSeen).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center pt-4">
        Cost figures are estimates from per-call price anchors in src/lib/log-ai-call.ts.
        Real billing lives in the Google AI Studio dashboard.
      </p>
    </div>
  );
}
