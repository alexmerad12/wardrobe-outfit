import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Admin gate: any non-admin who hits /admin/* gets a 404 (not 403).
// The page doesn't acknowledge it exists. Email check is done server
// side here AND repeated in any /api/admin route — never trust a
// client to gate itself.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

  if (!adminEmail || user?.email?.toLowerCase() !== adminEmail) {
    notFound();
  }

  return <>{children}</>;
}
