import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { pusherServer } from '@/lib/pusher'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  // 1. Get the raw body as text (it's form-urlencoded data)
  const bodyText = await req.text() 
  
  // 2. Parse the body text into a URLSearchParams object
  const params = new URLSearchParams(bodyText)

  // 3. Extract the values
  const socket_id = params.get('socket_id')
  const channel_name = params.get('channel_name')

  if (!socket_id || !channel_name) {
    return new Response('Missing socket_id or channel_name', { status: 400 })
  }

  const user = session.user
  console.log('Auth user id:', user.id)


  
  const presenceData = {
    user_id: user.id,   // required
    name: user.name,
    email: user.email,
    image: user.image,
  }

 // ...
// src\app\api\pusher\auth\route.ts

// ... (code before try block)

try {
  const authResponse = await pusherServer.authorizeChannel(
    socket_id,
    channel_name,
    presenceData
  )

  return new Response(JSON.stringify(authResponse), {
    headers: { 'Content-Type': 'application/json' },
  })
} catch (error) {
  // Log the specific error to your console
  console.error('Pusher Authorization Error:', error) 
  
  // Return a generic 500 response, but the console log will show the issue.
  return new Response('Internal Server Error during Pusher Auth', { status: 500 })
}
}
