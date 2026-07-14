import Link from "next/link";

export default function Home() {
  return (
    <div className="px-6 py-12 max-w-3xl">
      <h1 className="text-2xl font-semibold">RapidFix — AutoShop Assistant demo</h1>
      <p className="mt-2 text-zinc-600">
        Browse seeded <Link href="/services" className="underline">services</Link> and{" "}
        <Link href="/jobs" className="underline">jobs</Link> to confirm the data layer.
      </p>
    </div>
  );
}
