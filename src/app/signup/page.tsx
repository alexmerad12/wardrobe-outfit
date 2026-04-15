"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const router = useRouter();

  useEffect(() => {
    // No auth needed - single user mode
    router.replace("/");
  }, [router]);

  return null;
}
