import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#7B1123] px-6 text-center text-white">
      <h1 className="text-4xl font-bold tracking-tight">Miracoli FC</h1>
      <p className="mt-2 text-sm text-[#78D5FA]">
        Scuola Calcio e Settore Giovanile · Campo dei Miracoli
      </p>
      <p className="mt-6 max-w-sm text-white/75">
        Allenamenti, convocazioni e comunicazioni della società, in un posto solo.
      </p>
      <Link
        href="/login"
        className="mt-8 rounded-xl bg-[#5BC0EB] px-8 py-3.5 font-semibold text-[#0F172A]"
      >
        Entra nell'area riservata
      </Link>
    </main>
  );
}
