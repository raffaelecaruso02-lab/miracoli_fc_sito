import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="flex items-center justify-between bg-[#660B1A] px-4 py-2 text-xs text-white/80">
        <Link href="/squadra" className="font-semibold text-white">
          Miracoli FC · Area tecnica
        </Link>
        <span>{user?.full_name}</span>
      </div>
      {children}
    </div>
  );
}
