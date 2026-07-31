import {NextResponse} from "next/server";
import {isAdminAuthedFromHeader} from "@/lib/admin/auth";
import {readBoundedJson, RequestBodyError} from "@/lib/api/request";
import {isShopKey} from "@/lib/seed";
import {supabaseService} from "@/lib/supabase/server";

const MAX_SHOP_BODY_BYTES = 512;

export async function POST(request: Request) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_SHOP_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "Invalid request body"}, {status: 400});
  }

  const shopKey =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).shopKey
      : undefined;
  if (typeof shopKey !== "string" || !isShopKey(shopKey)) {
    return NextResponse.json({error: "Invalid shop"}, {status: 400});
  }

  const {data: shop, error} = await supabaseService.rpc(
    "set_active_autoshop",
    {p_shop_key: shopKey}
  );
  if (error || !shop) {
    return NextResponse.json({error: "Failed to switch shop"}, {status: 500});
  }

  return NextResponse.json({ok: true, shop});
}
