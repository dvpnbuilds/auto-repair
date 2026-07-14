import { supabaseAnon } from "@/lib/supabase/client";

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH")}`;
}

export default async function ServicesPage() {
  const { data: services, error } = await supabaseAnon
    .from("autoshop_services")
    .select("*")
    .order("category");

  if (error) {
    return <div className="px-6 py-12">Failed to load services: {error.message}</div>;
  }

  return (
    <div className="px-6 py-12 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Services</h1>
      <ul className="divide-y divide-black/10">
        {services?.map((service) => (
          <li key={service.id} className="py-3 flex justify-between">
            <div>
              <div className="font-medium">{service.name}</div>
              <div className="text-sm text-zinc-600">{service.category}</div>
            </div>
            <div className="text-right text-sm">
              <div>
                {formatPeso(service.price_min)} – {formatPeso(service.price_max)}
              </div>
              <div className="text-zinc-600">{service.duration_minutes} min</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
