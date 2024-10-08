import { getFriendsByUserId } from '@/helpers/get-friends-by-user-id'
import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { chatHrefConstructor } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface Message {
  senderId: string;
  text: string;
}

const page = async ({}) => {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  const friends = await getFriendsByUserId(session.user.id)

  const friendsWithLastMessage = await Promise.all(
    friends.map(async (friend) => {
      const [lastMessageRaw] = (await fetchRedis(
        'zrange',
        `chat:${chatHrefConstructor(session.user.id, friend.id)}:messages`,
        -1,
        -1
      )) as string[]

      let lastMessage: Message = { senderId: '', text: '' } // Default value

      if (lastMessageRaw) {
        try {
          const parsedMessage = JSON.parse(lastMessageRaw)
          // Validate that the parsedMessage conforms to the Message type
          if (parsedMessage && typeof parsedMessage.senderId === 'string' && typeof parsedMessage.text === 'string') {
            lastMessage = parsedMessage
          } else {
            console.error('Invalid message structure:', parsedMessage)
          }
        } catch (error) {
          console.error('Error parsing last message:', error)
        }
      }

      return {
        ...friend,
        lastMessage,
      }
    })
  )

  // Filter out friends without a valid lastMessage.text
  const filteredFriends = friendsWithLastMessage.filter(
    friend => friend.lastMessage.text.trim() !== ''
  )

  return (
    <div className='container py-12'>
      <h1 className='font-bold text-5xl mb-8'>Recent chats</h1>
      {filteredFriends.length === 0 ? (
        <p className='text-sm text-zinc-500'>Nothing to show here...</p>
      ) : (
        filteredFriends.map((friend) => (
          <div
            key={friend.id}
            className='relative bg-zinc-50 border border-zinc-200 p-3 rounded-md'>
            <div className='absolute right-4 inset-y-0 flex items-center'>
              <ChevronRight className='h-7 w-7 text-zinc-400' />
            </div>

            <Link
              href={`/dashboard/chat/${chatHrefConstructor(
                session.user.id,
                friend.id
              )}`}
              className='relative sm:flex'>
              <div className='mb-4 flex-shrink-0 sm:mb-0 sm:mr-4'>
                <div className='relative h-6 w-6'>
                  <Image
                    referrerPolicy='no-referrer'
                    className='rounded-full'
                    alt={`${friend.name || 'Profile picture'}`}
                    src={friend.image || '/default-profile-pic.png'} // Default image
                    fill
                  />
                </div>
              </div>

              <div>
                <h4 className='text-lg font-semibold'>{friend.name || 'Unknown'}</h4>
                <p className='mt-1 max-w-md'>
                  <span className='text-zinc-400'>
                    {friend.lastMessage.senderId === session.user.id
                      ? 'You: '
                      : ''}
                  </span>
                  {friend.lastMessage.text || 'No message'}
                </p>
              </div>
            </Link>
          </div>
        ))
      )}
    </div>
  )
}

export default page
