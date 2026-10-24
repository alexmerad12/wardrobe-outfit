// PostgREST answers at most 1,000 rows per request (Supabase's max-rows),
// and a plain select doesn't say it stopped: the admin dashboard read the
// first 1,000 of 1,204 ai_calls and showed "1,000 AI calls all-time" and 0
// calls in the last 7 days (2026-10-24). Read whole tables in pages.
//
// fetchPage gets an inclusive row range, like supabase-js `.range(from, to)`;
// give the query a stable order (a unique column) so pages don't overlap.
export const PAGE_SIZE = 1000;

export async function selectAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
