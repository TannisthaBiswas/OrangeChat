// /app/api/message/typing/route.ts
import { getServerSession } from 'next-auth'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { chatId } = await req.json()
  if (!chatId) return new Response('Invalid request', { status: 400 })

  const { user } = session

  await pusherServer.trigger(
    toPusherKey(`chat:${chatId}`),
    'typing',
    { userId: user.id }
  )

  return new Response('OK', { status: 200 })
}
