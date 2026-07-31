import {Link} from "@/i18n/navigation";

export default function AdminSectionNav({
  active,
  boardLabel,
  dashboardLabel,
}: {
  active: "board" | "dashboard";
  boardLabel: string;
  dashboardLabel: string;
}) {
  const base =
    "rounded-lg px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087f78]";
  const selected = "bg-[#173744] text-white";
  const idle = "text-[#52676f] hover:bg-white hover:text-[#173744]";

  return (
    <nav
      aria-label={dashboardLabel}
      className="mb-7 inline-flex rounded-xl border border-[#dce5e3] bg-[#f4f7f6] p-1"
    >
      <Link
        href="/admin"
        aria-current={active === "board" ? "page" : undefined}
        className={`${base} ${active === "board" ? selected : idle}`}
      >
        {boardLabel}
      </Link>
      <Link
        href="/admin/dashboard"
        aria-current={active === "dashboard" ? "page" : undefined}
        className={`${base} ${active === "dashboard" ? selected : idle}`}
      >
        {dashboardLabel}
      </Link>
    </nav>
  );
}
