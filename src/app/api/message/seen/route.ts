import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db' 
import { getServerSession } from 'next-auth'
import { pusherServer } from '@/lib/pusher' 
import { toPusherKey } from '@/lib/utils' 
import { fetchRedis } from '@/helpers/redis'
import { Message } from '@/lib/validations/message' 

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const body = await req.json()
    const { chatId }: { chatId: string } = body
    if (!chatId) return new Response('Invalid request', { status: 400 })

    const { user } = session
    const [userId1, userId2] = chatId.split('--')

    if (user.id !== userId1 && user.id !== userId2) {
      return new Response('Forbidden', { status: 403 })
    }

    const chatPartnerId = user.id === userId1 ? userId2 : userId1
    const now = Date.now()

    // 1. Get all messages from Redis Sorted Set (ZSET)
    const messages: string[] = await fetchRedis(
      'zrange',
      `chat:${chatId}:messages`,
      0,
      -1
    )

    // Parsing to the now-correct Message type
    const dbMessages = messages.map(
        (message) => JSON.parse(message) as Message
    )

    // 2. Identify and update unread messages sent by the chat partner
    const messagesToUpdate = dbMessages.filter(
      // This line is now valid because 'readAt' exists on the Message type
      (msg) => msg.senderId === chatPartnerId && !msg.readAt
    )
    
    // 3. Use a Redis Pipeline to perform atomic updates
    const updatePipeline = db.pipeline()

    for (const msg of messagesToUpdate) {
      const updatedMessage: Message = { ...msg, readAt: now }
      
      // Remove old message entry
      updatePipeline.zrem(`chat:${chatId}:messages`, JSON.stringify(msg))
      
      // FIX: Call zadd with the standard signature: ZADD key score member
      // This resolves the TypeScript issue caused by the previous spread operator workaround.
      updatePipeline.zadd(
  `chat:${chatId}:messages`,
  { score: msg.timestamp, member: JSON.stringify(updatedMessage) }
)

    }

    await updatePipeline.exec()

    // 4. Trigger real-time event to the *sender* (chat partner)
    await pusherServer.trigger(
      toPusherKey(`user:${chatPartnerId}:chats`), 
      'messages-read', 
      { 
        chatId,
        readAt: now,
      }
    )

    return new Response('OK', { status: 200 })
  } catch (error) {
    if (error instanceof Error) {
        return new Response(error.message, { status: 500 })
    }
    return new Response('Internal Server Error', { status: 500 })
  }
}