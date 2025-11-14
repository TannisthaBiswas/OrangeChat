// /app/api/message/edit/route.ts

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

    const { chatId, messageId, newText } = await req.json()

    if (!chatId || !messageId || typeof newText !== 'string') {
      return new Response('Invalid request', { status: 400 })
    }

    const trimmed = newText.trim()
    if (!trimmed) return new Response('Message cannot be empty', { status: 400 })

    const { user } = session
    const [userId1, userId2] = chatId.split('--')

    if (user.id !== userId1 && user.id !== userId2) {
      return new Response('Forbidden', { status: 403 })
    }

    // ------------------------------------
    // 1) Load messages from Redis
    // ------------------------------------
    const rawMessages: string[] = await fetchRedis(
      'zrange',
      `chat:${chatId}:messages`,
      0,
      -1
    )

    let rawToRemove: string | null = null
    let target: Message | null = null

    for (const raw of rawMessages) {
      const msg = JSON.parse(raw) as Message
      if (msg.id === messageId) {
        rawToRemove = raw
        target = msg
        break
      }
    }

    if (!target || !rawToRemove)
      return new Response('Message not found', { status: 404 })

    if (target.senderId !== user.id)
      return new Response('Forbidden', { status: 403 })

    // ------------------------------------
    // 2) Optional: Edit window (5 mins)
    // ------------------------------------
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000

    // Disable this if you want unlimited edit
    if (now - target.timestamp > fiveMinutes) {
      return new Response('Edit window expired', { status: 403 })
    }

    // ------------------------------------
    // 3) Build updated message
    // ------------------------------------
    const updatedMessage: Message = {
      ...target,
      text: trimmed,
      editedAt: now,
    }

    // ------------------------------------
    // 4) Update Redis atomically
    // ------------------------------------
    const pipeline = db.pipeline()
    pipeline.zrem(`chat:${chatId}:messages`, rawToRemove)
    pipeline.zadd(`chat:${chatId}:messages`, {
      score: target.timestamp,
      member: JSON.stringify(updatedMessage),
    })
    await pipeline.exec()

    // ------------------------------------
    // 5) Push update to participants
    // ------------------------------------
    await pusherServer.trigger(
      toPusherKey(`chat:${chatId}`),
      'message-edited',
      updatedMessage
    )

    return new Response('OK', { status: 200 })
    
  } catch (err) {
    console.error('[EDIT_MESSAGE_ERROR]', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
