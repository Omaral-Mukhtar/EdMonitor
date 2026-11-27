import { notFound, redirect } from "next/navigation";
import { StudyRoomClient } from "@/components/room3d/StudyRoomClient";
import { getCampusRoomBySlug } from "@/lib/campus-rooms";
import { getVerifiedProfile } from "@/lib/profile-server";

export const dynamic = "force-dynamic";

export default async function StudyRoomPage({
  params,
}: {
  params: Promise<{ roomSlug: string }>;
}) {
  const profile = await getVerifiedProfile(true);
  if (!profile) {
    redirect("/");
  }

  const { roomSlug } = await params;
  const room = getCampusRoomBySlug(roomSlug);
  if (!room) {
    notFound();
  }

  return <StudyRoomClient key={room.slug} room={room} profile={profile} />;
}
