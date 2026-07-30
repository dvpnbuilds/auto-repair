import {NextResponse} from "next/server";
import {isAdminAuthedFromHeader} from "@/lib/admin/auth";
import {isShopKey} from "@/lib/seed";
import {supabaseService} from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isAdminAuthedFromHeader(request.headers.get("cookie"))) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const body = await request.json().catch(() => null);
  if (!isShopKey(body?.shopKey)) {
    return NextResponse.json({error: "Invalid shop"}, {status: 400});
  }

  const {data: shop, error} = await supabaseService.rpc(
    "set_active_autoshop",
    {p_shop_key: body.shopKey}
  );
  if (error || !shop) {
    return NextResponse.json({error: "Failed to switch shop"}, {status: 500});
  }

  return NextResponse.json({ok: true, shop});
}
