'use client'


import { pusherClient } from '@/lib/pusher'
import { chatHrefConstructor, toPusherKey } from '@/lib/utils'
import { usePathname, useRouter } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import UnseenChatToast from './UnseenChatToast'
import { formatDistanceToNow } from 'date-fns'

interface SidebarChatListProps {
  friends: User[]
  sessionId: string
}

interface ExtendedMessage extends Message {
  senderImg: string
  senderName: string
}


const SidebarChatList: FC<SidebarChatListProps> = ({ friends, sessionId }) => {
  const router = useRouter()
  const pathname = usePathname()
  const [unseenMessages, setUnseenMessages] = useState<Message[]>([])
  const [activeChats, setActiveChats] = useState<User[]>(friends)
 const [onlineFriends, setOnlineFriends] = useState<Record<string, boolean>>({})
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({})

  useEffect(() => {
    pusherClient.subscribe(toPusherKey(`user:${sessionId}:chats`))
    pusherClient.subscribe(toPusherKey(`user:${sessionId}:friends`))

    const newFriendHandler = (newFriend: User) => {
      //router.refresh()
      //console.log("received new user", newFriend)
      setActiveChats((prev) => [...prev, newFriend])
    } 

    const chatHandler = (message: ExtendedMessage) => {
      const shouldNotify =
        pathname !==
        `/dashboard/chat/${chatHrefConstructor(sessionId, message.senderId)}`

      if (!shouldNotify) return

      toast.custom((t) => (
        <UnseenChatToast
          t={t}
          sessionId={sessionId}
          senderId={message.senderId}
          senderImg={message.senderImg}
          senderMessage={message.text}
          senderName={message.senderName}
        />
      ))

      setUnseenMessages((prev) => [...prev, message])
    }

    pusherClient.bind('new_message', chatHandler)
    pusherClient.bind('new_friend', newFriendHandler)

    return () => {
      pusherClient.unsubscribe(toPusherKey(`user:${sessionId}:chats`))
      pusherClient.unsubscribe(toPusherKey(`user:${sessionId}:friends`))

      pusherClient.unbind('new_message', chatHandler)
      pusherClient.unbind('new_friend', newFriendHandler)
    }
  }, [pathname, sessionId, router])

 useEffect(() => {
  //const channelName = toPusherKey(`presence-friends-${sessionId}`)
 const channelName = toPusherKey('presence-online-users')
  const channel = pusherClient.subscribe(channelName) as any
console.log(`Presence: Calling subscribe for ${channelName}`);

   
 channel.bind('pusher:subscription_succeeded', (members: any) => {
    const initialOnline: Record<string, boolean> = {}
    members.each((member: any) => {
        initialOnline[member.id] = true // Include everyone
    })
    setOnlineFriends(initialOnline)
})

  channel.bind('pusher:member_added', (member: any) => {
    console.log('Member added:', member.id)
    setOnlineFriends(prev => ({ ...prev, [member.id]: true }))
  })

  channel.bind('pusher:member_removed', (member: any) => {
    console.log('Member removed:', member.id)
    setOnlineFriends(prev => ({ ...prev, [member.id]: false }))
    setLastSeen(prev => ({ ...prev, [member.id]: Date.now() }))
  })


  // Sidebar.tsx - Inside the presence useEffect
channel.bind('pusher:subscription_error', (status: any) => {
    // This will fire if the client receives the 200 auth response 
    // but the actual Pusher service rejects the subscription.
    console.error('Pusher Subscription Error Status:', status); 
});
  return () => {
    pusherClient.unsubscribe(channelName)
  }
}, [sessionId])


  
  useEffect(() => {
    if (pathname?.includes('chat')) {
      setUnseenMessages((prev) => {
        return prev.filter((msg) => !pathname.includes(msg.senderId))
      })
    }
  }, [pathname])

  return (
    <ul role='list' className='max-h-[25rem] overflow-y-auto -mx-2 space-y-1'>
      {activeChats.sort().map((friend) => {
        const unseenMessagesCount = unseenMessages.filter((unseenMsg) => {
          return unseenMsg.senderId === friend.id
        }).length

        return (
          <li key={friend.id}>
            <a
              href={`/dashboard/chat/${chatHrefConstructor(
                sessionId,
                friend.id
              )}`}
              className='text-gray-700 hover:text-indigo-600 hover:bg-gray-50 group flex items-center gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'>
              {friend.name}
              
               {onlineFriends[friend.id] ? (
            <span className="text-green-500 ml-2">• Online</span>
          ) : lastSeen[friend.id] ? (
            <span className="text-gray-400 ml-2">
              • Last seen {formatDistanceToNow(new Date(lastSeen[friend.id]), { addSuffix: true })}
            </span>
          ) : null}
              {unseenMessagesCount > 0 ? (
                <div className='bg-indigo-600 font-medium text-xs text-white w-4 h-4 rounded-full flex justify-center items-center'>
                  {unseenMessagesCount}
                </div>
              ) : null}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export default SidebarChatList
