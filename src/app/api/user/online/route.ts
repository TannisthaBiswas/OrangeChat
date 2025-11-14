import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { pusherServer } from "@/lib/pusher";
import { toPusherKey } from "@/lib/utils";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;

  // Mark as online for 60 seconds (heartbeat will extend)
  await db.set(`user:${userId}:online`, "1", { ex: 60 });

  await pusherServer.trigger(
    toPusherKey(`user:${userId}:status`),
    "status-update",
    { userId, online: true }
  );

  return new Response("OK");
}
