import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { pusherServer } from "@/lib/pusher";
import { toPusherKey } from "@/lib/utils";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;
  const now = Date.now();

  await db.set(`user:${userId}:online`, "0");
  await db.set(`user:${userId}:lastSeen`, now);

  await pusherServer.trigger(
    toPusherKey(`user:${userId}:status`),
    "status-update",
    { userId, online: false, lastSeen: now }
  );

  return new Response("OK");
}
