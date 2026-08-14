import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";

export default async function HomePage() {
  const admin = await getAdmin();
  redirect(admin ? "/operacao" : "/login");
}
