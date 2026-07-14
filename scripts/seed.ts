import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const services = [
  { name: "Oil Change", category: "Maintenance", price_min: 800, price_max: 1500, duration_minutes: 30 },
  { name: "Brake Pad Replacement", category: "Brakes", price_min: 1800, price_max: 3500, duration_minutes: 90 },
  { name: "Aircon Repair", category: "Aircon", price_min: 1500, price_max: 6000, duration_minutes: 120 },
  { name: "Battery Replacement", category: "Electrical", price_min: 3500, price_max: 6500, duration_minutes: 30 },
  { name: "Wheel Alignment", category: "Suspension", price_min: 600, price_max: 1200, duration_minutes: 45 },
  { name: "Engine Diagnostic", category: "Engine", price_min: 500, price_max: 1500, duration_minutes: 60 },
  { name: "Timing Belt Replacement", category: "Engine", price_min: 6000, price_max: 12000, duration_minutes: 240 },
  { name: "Suspension Repair", category: "Suspension", price_min: 2500, price_max: 8000, duration_minutes: 150 },
  { name: "Tire Replacement (per tire)", category: "Tires", price_min: 2000, price_max: 5500, duration_minutes: 20 },
  { name: "Transmission Check", category: "Transmission", price_min: 1000, price_max: 3000, duration_minutes: 60 },
];

const jobs = [
  {
    customer_name: "Jerome Villanueva",
    plate_number: "NBC 1234",
    phone: "0917 555 0142",
    vehicle: "2015 Toyota Vios",
    serviceName: "Brake Pad Replacement",
    issue_description: "Kumakalampag pag nagbe-brake, parang bakal kagat-kagat.",
    probable_issue: "Worn brake pads",
    urgency: "high",
    estimate_min: 1800,
    estimate_max: 3500,
    status: "in_progress",
  },
  {
    customer_name: "Ana Reyes",
    plate_number: "ABC 5821",
    phone: "0918 555 0987",
    vehicle: "2018 Honda City",
    serviceName: "Aircon Repair",
    issue_description: "Mainit hangin sa aircon kahit naka-max na yung blower.",
    probable_issue: "Low refrigerant / possible leak",
    urgency: "medium",
    estimate_min: 1500,
    estimate_max: 6000,
    status: "waiting_parts",
  },
  {
    customer_name: "Marco Dela Cruz",
    plate_number: "XYZ 9087",
    phone: "0919 555 0456",
    vehicle: "2012 Mitsubishi Adventure",
    serviceName: "Battery Replacement",
    issue_description: "Ayaw na mag-start, mabagal yung crank tapos namamatay dashboard lights.",
    probable_issue: "Dead or failing battery",
    urgency: "high",
    estimate_min: 3500,
    estimate_max: 6500,
    status: "ready",
  },
  {
    customer_name: "Liza Fernandez",
    plate_number: "DEF 3344",
    phone: "0920 555 0221",
    vehicle: "2020 Suzuki Ertiga",
    serviceName: "Oil Change",
    issue_description: "Regular PM lang, malapit na sa 5000km.",
    probable_issue: "Routine maintenance",
    urgency: "low",
    estimate_min: 800,
    estimate_max: 1500,
    status: "booked",
  },
  {
    customer_name: "Paolo Santos",
    plate_number: "GHI 7712",
    phone: "0921 555 0678",
    vehicle: "2016 Ford Ranger",
    serviceName: "Suspension Repair",
    issue_description: "May tunog na 'tuk tuk' sa harap tuwing may bump, lalo na sa mabilis.",
    probable_issue: "Worn stabilizer link or shock mount",
    urgency: "medium",
    estimate_min: 2500,
    estimate_max: 8000,
    status: "done",
  },
];

async function seed() {
  console.log("Seeding services...");
  const { data: upsertedServices, error: servicesError } = await supabase
    .from("autoshop_services")
    .upsert(services, { onConflict: "name" })
    .select();

  if (servicesError) throw servicesError;

  await seedJobs(upsertedServices!);
}

async function seedJobs(seededServices: { id: string; name: string }[]) {
  console.log("Clearing existing jobs...");
  await supabase.from("autoshop_jobs").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("Seeding jobs...");
  for (const job of jobs) {
    const service = seededServices.find((s) => s.name === job.serviceName);
    const { data: insertedJob, error: jobError } = await supabase
      .from("autoshop_jobs")
      .insert({
        customer_name: job.customer_name,
        plate_number: job.plate_number,
        phone: job.phone,
        vehicle: job.vehicle,
        service_id: service?.id ?? null,
        issue_description: job.issue_description,
        probable_issue: job.probable_issue,
        urgency: job.urgency,
        estimate_min: job.estimate_min,
        estimate_max: job.estimate_max,
        status: job.status,
      })
      .select()
      .single();

    if (jobError) throw jobError;

    const { error: historyError } = await supabase.from("autoshop_status_history").insert({
      job_id: insertedJob.id,
      status: job.status,
      note: "Seeded demo state",
    });

    if (historyError) throw historyError;
  }

  console.log(`Seeded ${jobs.length} jobs for RapidFix demo.`);
}

seed()
  .then(() => {
    console.log("Seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
