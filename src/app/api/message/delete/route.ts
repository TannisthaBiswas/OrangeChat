// /app/api/message/delete/route.ts
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { Message } from '@/lib/validations/message'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { chatId, messageId } = await req.json()
    if (!chatId || !messageId) return new Response('Invalid request', { status: 400 })

    const [userId1, userId2] = chatId.split('--')
    const { user } = session

    if (user.id !== userId1 && user.id !== userId2) {
      return new Response('Forbidden', { status: 403 })
    }

    const messages: string[] = await fetchRedis('zrange', `chat:${chatId}:messages`, 0, -1)
    const parsedMessages = messages.map((m) => JSON.parse(m) as Message)
    const targetMessage = parsedMessages.find((m) => m.id === messageId)

    if (!targetMessage) return new Response('Message not found', { status: 404 })
    if (targetMessage.senderId !== user.id) return new Response('Forbidden', { status: 403 })

    const now = Date.now()
    const oneHour = 60 * 60 * 1000
    if (now - targetMessage.timestamp > oneHour) {
      return new Response('Cannot unsend after 1 hour', { status: 403 })
    }

    // Remove old message from Redis
    await db.zrem(`chat:${chatId}:messages`, JSON.stringify(targetMessage))

    // Notify both participants via Pusher
    await pusherServer.trigger(
      toPusherKey(`chat:${chatId}`),
      'message-deleted',
      { messageId, chatId }
    )

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
