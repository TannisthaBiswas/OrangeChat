import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { pusherServer } from "@/lib/pusher";
import { toPusherKey } from "@/lib/utils";
import { fetchRedis } from "@/helpers/redis";

export async function POST(req: Request) {
  try {
    const { messageId, chatId, deliveredAt } = await req.json();

    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const [user1, user2] = chatId.split("--");
    const receiverId = session.user.id;

    // Ensure this endpoint is called by the receiver only
    if (receiverId !== user1 && receiverId !== user2) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const senderId = receiverId === user1 ? user2 : user1;

    // Fetch all messages
    const rawMessages = (await fetchRedis(
      "zrange",
      `chat:${chatId}:messages`,
      0,
      -1
    )) as string[];

    // Find message
    const index = rawMessages.findIndex((m) => JSON.parse(m).id === messageId);
    if (index === -1)
      return new NextResponse("Message not found", { status: 404 });

    const msg = JSON.parse(rawMessages[index]);

    // If already delivered, do nothing (idempotency)
    if (msg.deliveredAt) {
      return NextResponse.json({ status: "already delivered" });
    }

    // Update message
    msg.deliveredAt = deliveredAt ?? Date.now();

    // Save back to Redis (same score to preserve ordering)
    await db.zadd(`chat:${chatId}:messages`, {
      score: msg.timestamp,
      member: JSON.stringify(msg),
    });

    // Notify sender
    await pusherServer.trigger(
      toPusherKey(`user:${senderId}`),
      "message-delivered-update",
      {
        messageId,
        chatId,
        deliveredAt: msg.deliveredAt,
      }
    );

    return NextResponse.json({ status: "ok", deliveredAt: msg.deliveredAt });
  } catch (err) {
    console.error(err);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
