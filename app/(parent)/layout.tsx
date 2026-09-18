import { getCurrentUser } from "@/lib/supabase/server";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="flex items-center justify-between bg-[#7B1123] px-4 py-3 text-white">
        <span className="font-semibold">Miracoli FC</span>
        <span className="text-xs text-white/70">{user?.full_name}</span>
      </div>
      {children}
    </div>
  );
}
