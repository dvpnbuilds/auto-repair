import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {
  detectImageMimeType,
  extensionForMimeType,
  MAX_INTAKE_PHOTOS,
  MAX_INTAKE_PHOTO_BYTES,
} from "../lib/photos/validation";
import {
  buildVisionTriagePrompt,
  runVisionTriage,
} from "../lib/openrouter/vision-triage";
import {
  isValidIntakePhotoTokenWithSecret,
  isValidPhotoActionTokenWithSecret,
  issueIntakePhotoTokenWithSecret,
  issuePhotoActionTokenWithSecret,
} from "../lib/photos/session-core";

const root = fileURLToPath(new URL("../", import.meta.url));

test("photo validation accepts only JPEG, PNG, and WebP signatures", () => {
  assert.equal(
    detectImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])),
    "image/jpeg"
  );
  assert.equal(
    detectImageMimeType(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ),
    "image/png"
  );
  assert.equal(
    detectImageMimeType(
      Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      ])
    ),
    "image/webp"
  );
  assert.equal(
    detectImageMimeType(new TextEncoder().encode("<svg></svg>")),
    null
  );
  assert.equal(extensionForMimeType("image/jpeg"), "jpg");
  assert.equal(MAX_INTAKE_PHOTOS, 3);
  assert.equal(MAX_INTAKE_PHOTO_BYTES, 4 * 1024 * 1024);
});

test("photo capabilities expire and stay bound to one action and photo", () => {
  const secret = "phase12-photo-capability-test-secret-value";
  const issuedAt = new Date("2026-07-31T00:00:00.000Z");
  const photoId = "12000000-0000-4000-8000-000000000001";
  const otherPhotoId = "12000000-0000-4000-8000-000000000002";
  const intakeToken = issueIntakePhotoTokenWithSecret(
    secret,
    issuedAt,
    "12000000-0000-4000-8000-000000000010"
  );
  const uploadToken = issuePhotoActionTokenWithSecret(
    intakeToken,
    photoId,
    "upload",
    secret,
    issuedAt
  );

  assert.equal(
    isValidIntakePhotoTokenWithSecret(
      intakeToken,
      secret,
      new Date("2026-07-31T12:00:00.000Z")
    ),
    true
  );
  assert.equal(
    isValidIntakePhotoTokenWithSecret(
      intakeToken,
      secret,
      new Date("2026-08-01T00:00:01.000Z")
    ),
    false
  );
  assert.equal(
    isValidPhotoActionTokenWithSecret(
      uploadToken,
      intakeToken,
      photoId,
      "upload",
      secret,
      new Date("2026-07-31T12:00:00.000Z")
    ),
    true
  );
  assert.equal(
    isValidPhotoActionTokenWithSecret(
      uploadToken,
      intakeToken,
      otherPhotoId,
      "upload",
      secret,
      new Date("2026-07-31T12:00:00.000Z")
    ),
    false
  );
  assert.equal(
    isValidPhotoActionTokenWithSecret(
      uploadToken,
      intakeToken,
      photoId,
      "delete",
      secret,
      new Date("2026-07-31T12:00:00.000Z")
    ),
    false
  );
});

test("vision prompt requires visible facts and keeps estimates price grounded", () => {
  const prompt = buildVisionTriagePrompt(
    [{
      name: "Engine Diagnostic",
      category: "Engine",
      price_min: 120,
      price_max: 180,
    }],
    true,
    {
      id: "12000000-0000-4000-8000-000000000001",
      shop_key: "us",
      name: "Northstar Auto Service",
      country: "US",
      locale: "en-US",
      currency: "USD",
      timezone: "America/Chicago",
      language: "en",
      email_sender_name: "Northstar",
      email_sender_address: "service@example.test",
      address: "Austin, TX",
      tagline: "Straight answers for the road ahead.",
      phone: "(512) 555-0108",
      hours: "Mon–Fri, 7:30 AM–6:00 PM",
      is_active: true,
    }
  );
  assert.match(prompt, /Report only visible facts/);
  assert.match(prompt, /Engine Diagnostic/);
  assert.match(prompt, /\$120-\$180/);
  assert.match(prompt, /does not confirm the underlying fault/);
});

test("photo upload is raw, length bounded, signature checked, and private", async () => {
  const uploadRoute = await readFile(
    join(root, "app", "api", "triage", "photos", "route.ts"),
    "utf8"
  );
  const migration = await readFile(
    join(
      root,
      "supabase",
      "migrations",
      "20260731150000_phase12_photo_intake.sql"
    ),
    "utf8"
  );
  const session = await readFile(
    join(root, "lib", "photos", "session.ts"),
    "utf8"
  );
  const sessionCore = await readFile(
    join(root, "lib", "photos", "session-core.ts"),
    "utf8"
  );
  const sessionRoute = await readFile(
    join(root, "app", "api", "triage", "photo-session", "route.ts"),
    "utf8"
  );
  const photoServer = await readFile(
    join(root, "lib", "photos", "server.ts"),
    "utf8"
  );
  const boundedBytes = await readFile(
    join(root, "lib", "api", "bounded-bytes-core.ts"),
    "utf8"
  );
  assert.match(uploadRoute, /readBoundedBytes/);
  assert.match(boundedBytes, /content-length/);
  assert.match(boundedBytes, /receivedBytes > maxBytes/);
  assert.match(uploadRoute, /MAX_INTAKE_PHOTO_BYTES/);
  assert.match(uploadRoute, /detectImageMimeType\(bytes\) !== mimeType/);
  assert.doesNotMatch(uploadRoute, /formData\(/);
  assert.match(uploadRoute, /photo-upload/);
  assert.match(uploadRoute, /isValidIntakePhotoToken/);
  assert.match(uploadRoute, /isValidPhotoActionToken/);
  assert.match(sessionCore, /createHmac/);
  assert.match(sessionCore, /timingSafeEqual/);
  assert.match(sessionCore, /TOKEN_LIFETIME_SECONDS/);
  assert.match(session, /issuePhotoActionToken/);
  assert.match(sessionRoute, /checkApiRateLimit/);
  assert.match(sessionRoute, /purgeExpiredUnattachedIntakePhotos/);
  assert.match(photoServer, /24 \* 60 \* 60 \* 1000/);
  assert.match(migration, /'auto-repair-intake-photos'/);
  assert.match(migration, /false,\s*4194304/);
  assert.match(
    migration,
    /revoke all on autoshop_intake_photos from anon, authenticated/
  );
  assert.doesNotMatch(migration, /create policy[\s\S]*storage\.objects/i);
});

test("vision failures fall back to the untouched text model path", async () => {
  const source = await readFile(
    join(root, "lib", "openrouter", "vision-triage.ts"),
    "utf8"
  );
  assert.match(source, /OPENROUTER_VISION_MODEL/);
  assert.match(source, /catch \{/);
  assert.match(source, /await runTriage\(messages, forceFinal\)/);
  assert.match(source, /vision_used: false/);
  assert.doesNotMatch(source, /OPENROUTER_MODEL/);
});

test("a live vision-provider failure returns text triage without visual findings", async (t) => {
  if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_VISION_MODEL) {
    t.skip("OpenRouter vision configuration is unavailable");
    return;
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const body = typeof init?.body === "string" ? init.body : "";
    if (
      url === "https://openrouter.ai/api/v1/chat/completions" &&
      body.includes("visual intake assistant")
    ) {
      return new Response("simulated vision outage", {status: 503});
    }
    return originalFetch(input, init);
  };

  try {
    const result = await runVisionTriage(
      [
        {
          role: "user",
          content: "The check engine warning light came on while driving.",
        },
      ],
      [
        {
          id: "12000000-0000-4000-8000-000000000001",
          mimeType: "image/jpeg",
          bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
        },
      ],
      true
    );
    assert.equal(result.status, "done");
    if (result.status === "done") {
      assert.equal(result.vision_attempted, true);
      assert.equal(result.vision_used, false);
      assert.deepEqual(result.visual_findings, []);
      assert.match(result.disclaimer, /subject to inspection/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("booking attaches the private intake session transactionally", async () => {
  const route = await readFile(
    join(root, "app", "api", "book", "route.ts"),
    "utf8"
  );
  const form = await readFile(
    join(root, "app", "[locale]", "book", "BookingForm.tsx"),
    "utf8"
  );
  const admin = await readFile(
    join(root, "app", "[locale]", "admin", "page.tsx"),
    "utf8"
  );
  assert.match(route, /create_autoshop_booking_with_photos/);
  assert.match(route, /hashIntakeKey/);
  assert.match(form, /autoshop-intake-photo-transfer/);
  assert.match(form, /intakeToken/);
  assert.match(admin, /createSignedUrls/);
  assert.doesNotMatch(admin, /getPublicUrl/);
});
