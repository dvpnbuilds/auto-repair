import { getActiveShop } from "@/lib/shop-config";
import IntakeForm from "./IntakeForm";

export default async function IntakePage() {
  const shop = await getActiveShop();
  return <IntakeForm shop={shop} />;
}
