import type {AppSupabaseClient} from "@/lib/supabase/schema";
import {createHash, randomUUID} from "node:crypto";

export type ShopKey = "us" | "ph";

type SeedService = {
  name: string;
  category: string;
  price_min: number;
  price_max: number;
  duration_minutes: number;
};

type SeedTechnician = {
  name: string;
};

type SeedJob = {
  customer_name: string;
  plate_number: string;
  phone: string;
  customer_email: string;
  vehicle: string;
  serviceName: string;
  issue_description: string;
  probable_issue: string;
  urgency: "low" | "medium" | "high";
  estimate_min: number;
  estimate_max: number;
  status: "booked" | "in_progress" | "waiting_parts" | "ready" | "done";
  scheduled_in_hours: number | null;
  technicianName: string;
  created_days_ago: number;
};

export const SEED_SHOPS = [
  {
    shop_key: "us" as const,
    name: "Northstar Auto Service",
    country: "US",
    locale: "en-US",
    currency: "USD",
    timezone: "America/Chicago",
    language: "en",
    email_sender_name: "Northstar Auto Service",
    email_sender_address: "service@northstar-auto.example",
    address: "1840 Westfield Avenue, Austin, TX",
    tagline: "Straight answers for the road ahead.",
    phone: "(512) 555-0108",
    hours: "Mon–Fri, 7:30 AM–6:00 PM · Sat, 8:00 AM–2:00 PM",
  },
  {
    shop_key: "ph" as const,
    name: "RapidFix Auto Care",
    country: "PH",
    locale: "en-PH",
    currency: "PHP",
    timezone: "Asia/Manila",
    language: "en",
    email_sender_name: "RapidFix Auto Care",
    email_sender_address: "service@rapidfix-auto.example",
    address: "Quezon City, Metro Manila",
    tagline: "Clear car care, from first check to final update.",
    phone: "+63 2 8555 0148",
    hours: "Mon–Sat, 8:00 AM–6:00 PM",
  },
];

const US_SERVICES: SeedService[] = [
  {name: "Oil Change", category: "Maintenance", price_min: 80, price_max: 210, duration_minutes: 45},
  {name: "Brake Pad Replacement", category: "Brakes", price_min: 240, price_max: 410, duration_minutes: 120},
  {name: "A/C Diagnostics & Recharge", category: "Climate Control", price_min: 250, price_max: 460, duration_minutes: 120},
  {name: "Battery Replacement", category: "Electrical", price_min: 240, price_max: 480, duration_minutes: 45},
  {name: "Wheel Alignment", category: "Steering & Suspension", price_min: 160, price_max: 330, duration_minutes: 60},
  {name: "Engine Diagnostic", category: "Engine", price_min: 120, price_max: 180, duration_minutes: 60},
  {name: "Timing Belt Replacement", category: "Engine", price_min: 600, price_max: 1500, duration_minutes: 300},
  {name: "Shock or Strut Replacement", category: "Steering & Suspension", price_min: 740, price_max: 2200, duration_minutes: 240},
  {name: "Tire Replacement (per tire)", category: "Tires", price_min: 150, price_max: 450, duration_minutes: 30},
  {name: "Transmission Service", category: "Transmission", price_min: 180, price_max: 770, duration_minutes: 120},
];

const PH_SERVICES: SeedService[] = [
  {name: "Oil Change", category: "Maintenance", price_min: 800, price_max: 1500, duration_minutes: 30},
  {name: "Brake Pad Replacement", category: "Brakes", price_min: 1800, price_max: 3500, duration_minutes: 90},
  {name: "Aircon Repair", category: "Aircon", price_min: 1500, price_max: 6000, duration_minutes: 120},
  {name: "Battery Replacement", category: "Electrical", price_min: 3500, price_max: 6500, duration_minutes: 30},
  {name: "Wheel Alignment", category: "Suspension", price_min: 600, price_max: 1200, duration_minutes: 45},
  {name: "Engine Diagnostic", category: "Engine", price_min: 500, price_max: 1500, duration_minutes: 60},
  {name: "Timing Belt Replacement", category: "Engine", price_min: 6000, price_max: 12000, duration_minutes: 240},
  {name: "Suspension Repair", category: "Suspension", price_min: 2500, price_max: 8000, duration_minutes: 150},
  {name: "Tire Replacement (per tire)", category: "Tires", price_min: 2000, price_max: 5500, duration_minutes: 20},
  {name: "Transmission Check", category: "Transmission", price_min: 1000, price_max: 3000, duration_minutes: 60},
];

export const SEED_SERVICES_BY_SHOP: Record<ShopKey, SeedService[]> = {
  us: US_SERVICES,
  ph: PH_SERVICES,
};

export const SEED_TECHNICIANS_BY_SHOP: Record<
  ShopKey,
  SeedTechnician[]
> = {
  us: [
    {name: "Jordan Lee"},
    {name: "Marcus Reed"},
    {name: "Elena Torres"},
    {name: "Caleb Morgan"},
  ],
  ph: [
    {name: "Miguel Santos"},
    {name: "Carlo Reyes"},
    {name: "Bea Navarro"},
    {name: "Jun Mendoza"},
  ],
};

const US_JOBS: SeedJob[] = [
  {
    customer_name: "Mason Brooks",
    plate_number: "LKM-4827",
    phone: "(512) 555-0142",
    customer_email: "mason@northstar-customer.example",
    vehicle: "2021 Ford F-150",
    serviceName: "Brake Pad Replacement",
    issue_description: "I hear a grinding noise from the front whenever I brake.",
    probable_issue: "Worn front brake pads",
    urgency: "high",
    estimate_min: 240,
    estimate_max: 410,
    status: "in_progress",
    scheduled_in_hours: null,
    technicianName: "Jordan Lee",
    created_days_ago: 1,
  },
  {
    customer_name: "Olivia Carter",
    plate_number: "RDT-6391",
    phone: "(512) 555-0187",
    customer_email: "olivia@northstar-customer.example",
    vehicle: "2020 Toyota Camry",
    serviceName: "A/C Diagnostics & Recharge",
    issue_description: "The air conditioner blows warm air even at the coldest setting.",
    probable_issue: "Low refrigerant or a possible A/C leak",
    urgency: "medium",
    estimate_min: 250,
    estimate_max: 460,
    status: "waiting_parts",
    scheduled_in_hours: null,
    technicianName: "Elena Torres",
    created_days_ago: 5,
  },
  {
    customer_name: "Ethan Ramirez",
    plate_number: "TXF-7754",
    phone: "(512) 555-0128",
    customer_email: "ethan@northstar-customer.example",
    vehicle: "2019 Chevrolet Silverado 1500",
    serviceName: "Battery Replacement",
    issue_description: "The truck cranks slowly and the lights dim when I try to start it.",
    probable_issue: "Weak or failing battery",
    urgency: "high",
    estimate_min: 240,
    estimate_max: 480,
    status: "ready",
    scheduled_in_hours: null,
    technicianName: "Marcus Reed",
    created_days_ago: 12,
  },
  {
    customer_name: "Sophia Bennett",
    plate_number: "NVS-2046",
    phone: "(512) 555-0163",
    customer_email: "sophia@northstar-customer.example",
    vehicle: "2022 Toyota RAV4",
    serviceName: "Oil Change",
    issue_description: "The maintenance reminder is on and the vehicle is due for an oil change.",
    probable_issue: "Routine maintenance",
    urgency: "low",
    estimate_min: 80,
    estimate_max: 210,
    status: "booked",
    scheduled_in_hours: 20,
    technicianName: "Caleb Morgan",
    created_days_ago: 35,
  },
  {
    customer_name: "Noah Williams",
    plate_number: "KCB-9185",
    phone: "(512) 555-0199",
    customer_email: "noah@northstar-customer.example",
    vehicle: "2018 Honda Pilot",
    serviceName: "Shock or Strut Replacement",
    issue_description: "The SUV bounces after bumps and makes a knocking sound from the front.",
    probable_issue: "Worn front struts or upper mounts",
    urgency: "medium",
    estimate_min: 740,
    estimate_max: 2200,
    status: "done",
    scheduled_in_hours: null,
    technicianName: "Jordan Lee",
    created_days_ago: 70,
  },
];

const PH_JOBS: SeedJob[] = [
  {
    customer_name: "Jerome Villanueva",
    plate_number: "NBC 1234",
    phone: "0917 555 0142",
    customer_email: "jerome@rapidfix-customer.example",
    vehicle: "2015 Toyota Vios",
    serviceName: "Brake Pad Replacement",
    issue_description: "There is a grinding metal noise whenever I brake.",
    probable_issue: "Worn brake pads",
    urgency: "high",
    estimate_min: 1800,
    estimate_max: 3500,
    status: "in_progress",
    scheduled_in_hours: null,
    technicianName: "Miguel Santos",
    created_days_ago: 10,
  },
  {
    customer_name: "Ana Reyes",
    plate_number: "ABC 5821",
    phone: "0918 555 0987",
    customer_email: "ana@rapidfix-customer.example",
    vehicle: "2018 Honda City",
    serviceName: "Aircon Repair",
    issue_description: "The air conditioner blows warm air even at the maximum setting.",
    probable_issue: "Low refrigerant or a possible leak",
    urgency: "medium",
    estimate_min: 1500,
    estimate_max: 6000,
    status: "waiting_parts",
    scheduled_in_hours: null,
    technicianName: "Bea Navarro",
    created_days_ago: 18,
  },
  {
    customer_name: "Marco Dela Cruz",
    plate_number: "XYZ 9087",
    phone: "0919 555 0456",
    customer_email: "marco@rapidfix-customer.example",
    vehicle: "2012 Mitsubishi Adventure",
    serviceName: "Battery Replacement",
    issue_description: "The engine will not start, it cranks slowly, and the dashboard lights go out.",
    probable_issue: "Dead or failing battery",
    urgency: "high",
    estimate_min: 3500,
    estimate_max: 6500,
    status: "ready",
    scheduled_in_hours: null,
    technicianName: "Carlo Reyes",
    created_days_ago: 26,
  },
  {
    customer_name: "Liza Fernandez",
    plate_number: "DEF 3344",
    phone: "0920 555 0221",
    customer_email: "liza@rapidfix-customer.example",
    vehicle: "2020 Suzuki Ertiga",
    serviceName: "Oil Change",
    issue_description: "The car is near 5,000 km and is due for routine maintenance.",
    probable_issue: "Routine maintenance",
    urgency: "low",
    estimate_min: 800,
    estimate_max: 1500,
    status: "booked",
    scheduled_in_hours: 20,
    technicianName: "Jun Mendoza",
    created_days_ago: 40,
  },
  {
    customer_name: "Paolo Santos",
    plate_number: "GHI 7712",
    phone: "0921 555 0678",
    customer_email: "paolo@rapidfix-customer.example",
    vehicle: "2016 Ford Ranger",
    serviceName: "Suspension Repair",
    issue_description: "There is a knocking sound from the front whenever I drive over a bump.",
    probable_issue: "Worn stabilizer link or shock mount",
    urgency: "medium",
    estimate_min: 2500,
    estimate_max: 8000,
    status: "done",
    scheduled_in_hours: null,
    technicianName: "Miguel Santos",
    created_days_ago: 80,
  },
];

export const SEED_JOBS_BY_SHOP: Record<ShopKey, SeedJob[]> = {
  us: US_JOBS,
  ph: PH_JOBS,
};

export function isShopKey(value: string | undefined): value is ShopKey {
  return value === "us" || value === "ph";
}

export async function seedDatabase(
  supabase: AppSupabaseClient,
  requestedActiveShop: ShopKey = "us"
) {
  const {error: deactivateError} = await supabase
    .from("autoshop_shops")
    .update({is_active: false})
    .eq("is_active", true);
  if (deactivateError) throw deactivateError;

  const shopsToUpsert = SEED_SHOPS.map((shop) => ({
    ...shop,
    is_active: shop.shop_key === requestedActiveShop,
  }));
  const {data: shops, error: shopsError} = await supabase
    .from("autoshop_shops")
    .upsert(shopsToUpsert, {onConflict: "shop_key"})
    .select();
  if (shopsError) throw shopsError;

  const {data: existingJobs, error: existingJobsError} = await supabase
    .from("autoshop_jobs")
    .select("shop_id, plate_number, technician_id");
  if (existingJobsError) throw existingJobsError;

  const technicianRows =
    shops?.flatMap((shop) =>
      SEED_TECHNICIANS_BY_SHOP[shop.shop_key as ShopKey].map(
        (technician) => ({
          ...technician,
          shop_id: shop.id,
          is_active: true,
        })
      )
    ) ?? [];
  const {data: technicians, error: techniciansError} = await supabase
    .from("autoshop_technicians")
    .upsert(technicianRows, {onConflict: "shop_id,name"})
    .select();
  if (techniciansError) throw techniciansError;

  const currentTechnicianIds = new Set(
    (technicians ?? []).map((technician) => technician.id)
  );
  const preservedAssignments = new Map(
    (existingJobs ?? [])
      .filter(
        (job) =>
          job.technician_id &&
          currentTechnicianIds.has(job.technician_id)
      )
      .map((job) => [
        `${job.shop_id}:${job.plate_number}`,
        job.technician_id as string,
      ])
  );

  const {data: intakePhotos, error: intakePhotosError} = await supabase
    .from("autoshop_intake_photos")
    .select("storage_path");
  if (intakePhotosError) throw intakePhotosError;
  const photoPaths = (intakePhotos ?? []).map((photo) => photo.storage_path);
  if (photoPaths.length > 0) {
    const photoBucket =
      process.env.INTAKE_PHOTO_BUCKET?.trim() ||
      "auto-repair-intake-photos";
    const {error: storageDeleteError} = await supabase.storage
      .from(photoBucket)
      .remove(photoPaths);
    if (storageDeleteError) throw storageDeleteError;
  }
  const {error: deletePhotoRowsError} = await supabase
    .from("autoshop_intake_photos")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (deletePhotoRowsError) throw deletePhotoRowsError;

  const {error: deleteIntakeSessionsError} = await supabase
    .from("autoshop_intake_sessions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteIntakeSessionsError) throw deleteIntakeSessionsError;

  const {error: deleteJobsError} = await supabase
    .from("autoshop_jobs")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteJobsError) throw deleteJobsError;

  const {error: deleteServicesError} = await supabase
    .from("autoshop_services")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteServicesError) throw deleteServicesError;

  const serviceRows = shops?.flatMap((shop) =>
    SEED_SERVICES_BY_SHOP[shop.shop_key as ShopKey].map((service) => ({
      ...service,
      shop_id: shop.id,
    }))
  ) ?? [];
  const {data: services, error: servicesError} = await supabase
    .from("autoshop_services")
    .insert(serviceRows)
    .select();
  if (servicesError) throw servicesError;

  let jobsInserted = 0;
  const jobsByShop = new Map<string, Array<{id: string; created_at: string}>>();
  for (const shop of shops ?? []) {
    const shopKey = shop.shop_key as ShopKey;
    for (const job of SEED_JOBS_BY_SHOP[shopKey]) {
      const service = services?.find(
        (item) => item.shop_id === shop.id && item.name === job.serviceName
      );
      const defaultTechnician = technicians?.find(
        (technician) =>
          technician.shop_id === shop.id &&
          technician.name === job.technicianName
      );
      const technicianId =
        preservedAssignments.get(`${shop.id}:${job.plate_number}`) ??
        defaultTechnician?.id ??
        null;
      const createdAt = new Date(
        Date.now() - job.created_days_ago * 24 * 60 * 60 * 1000
      ).toISOString();
      const {data: insertedJob, error: jobError} = await supabase
        .from("autoshop_jobs")
        .insert({
          shop_id: shop.id,
          customer_name: job.customer_name,
          plate_number: job.plate_number,
          phone: job.phone,
          customer_email: job.customer_email,
          vehicle: job.vehicle,
          service_id: service?.id ?? null,
          technician_id: technicianId,
          issue_description: job.issue_description,
          probable_issue: job.probable_issue,
          urgency: job.urgency,
          estimate_min: job.estimate_min,
          estimate_max: job.estimate_max,
          status: job.status,
          scheduled_at:
            job.scheduled_in_hours === null
              ? null
              : new Date(
                  Date.now() + job.scheduled_in_hours * 60 * 60 * 1000
                ).toISOString(),
          created_at: createdAt,
        })
        .select()
        .single();
      if (jobError) throw jobError;

      const {error: historyError} = await supabase
        .from("autoshop_status_history")
        .insert({
          job_id: insertedJob.id,
          status: job.status,
          note: "Seeded demo state",
          created_at: createdAt,
        });
      if (historyError) throw historyError;
      const shopJobs = jobsByShop.get(shop.id) ?? [];
      shopJobs.push({id: insertedJob.id, created_at: createdAt});
      jobsByShop.set(shop.id, shopJobs);
      jobsInserted += 1;
    }
  }

  for (const shop of shops ?? []) {
    const shopJobs = jobsByShop.get(shop.id) ?? [];
    const bookedSessions = shopJobs.map((job) => ({
      id: randomUUID(),
      shop_id: shop.id,
      job_id: job.id,
      started_at: job.created_at,
      completed_at: job.created_at,
      booked_at: job.created_at,
    }));
    const extraDays = shop.shop_key === "us" ? [2, 20, 60] : [15, 50];
    const unbookedSessions = extraDays.map((daysAgo) => {
      const timestamp = new Date(
        Date.now() - daysAgo * 24 * 60 * 60 * 1000
      ).toISOString();
      return {
        id: randomUUID(),
        shop_id: shop.id,
        job_id: null,
        started_at: timestamp,
        completed_at: timestamp,
        booked_at: null,
      };
    });
    const {error: intakeSessionsError} = await supabase
      .from("autoshop_intake_sessions")
      .insert([...bookedSessions, ...unbookedSessions]);
    if (intakeSessionsError) throw intakeSessionsError;

    for (const [index, job] of shopJobs.slice(0, 2).entries()) {
      const decidedAt = new Date(
        new Date(job.created_at).getTime() + 60 * 60 * 1000
      ).toISOString();
      const approvalId = randomUUID();
      const {error: approvalError} = await supabase
        .from("autoshop_approval_requests")
        .insert({
          id: approvalId,
          shop_id: shop.id,
          job_id: job.id,
          message_id: null,
          description: "Additional repair found during inspection",
          line_items: [{name: "Additional repair", amount: index === 0 ? 180 : 120}],
          amount: index === 0 ? 180 : 120,
          customer_explanation:
            "The technician found an additional item that should be addressed.",
          status: index === 0 ? "approved" : "declined",
          token_hash: createHash("sha256")
            .update(`seed-approval:${approvalId}`)
            .digest("hex"),
          expires_at: new Date(
            new Date(decidedAt).getTime() + 24 * 60 * 60 * 1000
          ).toISOString(),
          decided_at: decidedAt,
          created_at: job.created_at,
        });
      if (approvalError) throw approvalError;
    }

    const reminderJob = shopJobs[0];
    if (reminderJob) {
      const {error: reminderError} = await supabase
        .from("autoshop_email_deliveries")
        .insert({
          shop_id: shop.id,
          job_id: reminderJob.id,
          message_id: null,
          template_id: "reminder",
          transport: "resend",
          recipient: "demo-customer@example.com",
          status: "sent",
          provider_message_id: `seed-reminder-${reminderJob.id}`,
          created_at: reminderJob.created_at,
          sent_at: reminderJob.created_at,
        });
      if (reminderError) throw reminderError;
    }
  }

  return {
    shops: shops?.length ?? 0,
    technicians: technicians?.length ?? 0,
    services: services?.length ?? 0,
    jobs: jobsInserted,
    activeShop: requestedActiveShop,
  };
}
