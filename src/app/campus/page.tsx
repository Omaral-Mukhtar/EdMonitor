import { redirect } from "next/navigation";
import { CampusMapClient } from "@/components/campus/CampusMapClient";
import { getVerifiedProfile } from "@/lib/profile-server";

export const dynamic = "force-dynamic";

export default async function CampusPage() {
  const profile = await getVerifiedProfile(true);
  if (!profile) {
    redirect("/");
  }

  return <CampusMapClient profile={profile} />;
}
