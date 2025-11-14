'use client'

import { pusherClient } from '@/lib/pusher'
import { cn, toPusherKey } from '@/lib/utils'
import { Message } from '@/lib/validations/message'
import { format } from 'date-fns'
import Image from 'next/image'
import { FC, useEffect, useRef, useState, useCallback } from 'react'

interface User {
  id: string
  name: string
  email: string
  image: string
}

interface MessagesProps {
  initialMessages: Message[]
  sessionId: string
  chatId: string
  sessionImg: string | null | undefined
  chatPartner: User
}

const Messages: FC<MessagesProps> = ({
  initialMessages,
  sessionId,
  chatId,
  chatPartner,
  sessionImg,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollDownRef = useRef<HTMLDivElement | null>(null)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null) // 🆕 Right-click menu

  const chatPartnerId = chatPartner?.id

  const lastUnreadPartnerMessageId =
    messages.find((msg) => msg.senderId === chatPartnerId && !msg.readAt)?.id || null

  const markMessagesAsSeen = useCallback(() => {
    if (!lastUnreadPartnerMessageId) return
    fetch('/api/message/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
    }).catch((err) => console.error('Failed to mark messages as seen:', err))
  }, [chatId, lastUnreadPartnerMessageId])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container || !lastUnreadPartnerMessageId) return

    const target = container.querySelector(`[data-message-id="${lastUnreadPartnerMessageId}"]`)
    if (!target) return

    const handleScroll = () => {
      const rect = target.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const isVisible =
        rect.top < containerRect.bottom &&
        rect.bottom > containerRect.top + rect.height * 0.2

      if (isVisible) {
        container.removeEventListener('scroll', handleScroll)
        markMessagesAsSeen()
      }
    }

    container.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => container.removeEventListener('scroll', handleScroll)
  }, [markMessagesAsSeen, lastUnreadPartnerMessageId])

  useEffect(() => {
    pusherClient.subscribe(toPusherKey(`chat:${chatId}`))
    pusherClient.subscribe(toPusherKey(`user:${sessionId}:chats`))

    const messageHandler = (message: Message) => {
      setMessages((prev) => {
        if (!prev.find((msg) => msg.id === message.id)) {
         return [message, ...prev]
          //return [...prev, message]
        }
        return prev
      })
    }

    const readHandler = ({ chatId: eventChatId, readAt }: { chatId: string; readAt: number }) => {
      if (eventChatId === chatId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.senderId === sessionId && !msg.readAt ? { ...msg, readAt } : msg
          )
        )
      }
    }

    const typingHandler = (data: { userId: string }) => {
      if (data.userId !== sessionId) {
        setPartnerTyping(true)
        setTimeout(() => setPartnerTyping(false), 3000)
      }
    }

    const deleteHandler = ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId))
    }

    
    const editHandler = (updatedMsg: Message) => {
  setMessages((prev) =>
    prev.map((msg) =>
      msg.id === updatedMsg.id
        ? { ...msg, text: updatedMsg.text, editedAt: updatedMsg.editedAt }
        : msg
    )
  )
}

const deliveredHandler = ({
  messageId,
  deliveredAt,
}: {
  messageId: string
  deliveredAt: number
}) => {
  setMessages((prev) =>
    prev.map((msg) =>
      msg.id === messageId ? { ...msg, deliveredAt } : msg
    )
  )
}


    pusherClient.bind('incoming-message', messageHandler)
    pusherClient.bind('messages-read', readHandler)
    pusherClient.bind('typing', typingHandler)
    pusherClient.bind('message-deleted', deleteHandler)
    pusherClient.bind('message-edited', editHandler)
    pusherClient.bind("message-delivered-update", deliveredHandler)

    return () => {
      pusherClient.unsubscribe(toPusherKey(`chat:${chatId}`))
      pusherClient.unsubscribe(toPusherKey(`user:${sessionId}:chats`))
      pusherClient.unbind('incoming-message', messageHandler)
      pusherClient.unbind('messages-read', readHandler)
      pusherClient.unbind('typing', typingHandler)
      pusherClient.unbind('message-deleted', deleteHandler)
      pusherClient.unbind('message-edited', editHandler)
      pusherClient.unbind("message-delivered-update", deliveredHandler)

    }
  }, [chatId, sessionId])

  if (!chatPartnerId) {
    return <div className='text-gray-500 p-4'>Chat not available</div>
  }

  const formatTimestamp = (timestamp: number) => format(timestamp, 'HH:mm')

  return (
    <div
      id='messages'
      ref={messagesContainerRef}
      className='flex h-full flex-1 flex-col-reverse gap-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch'
    >
      <div ref={scrollDownRef} />

      {partnerTyping && (
        <div className='text-sm text-gray-400 italic px-3 pb-2'>
          {chatPartner.name} is typing...
        </div>
      )}

      {messages.map((message, index) => {
        const isCurrentUser = message.senderId === sessionId
        const hasNextMessageFromSameUser = messages[index - 1]?.senderId === message.senderId
        const withinOneHour = Date.now() - message.timestamp <= 60 * 60 * 1000

        return (
          <div
           // key={`${message.id}-${message.timestamp}`}
           key={message.id}

            className='chat-message relative'
            data-message-id={message.id}
            onContextMenu={(e) => {
              e.preventDefault()
              if (isCurrentUser && withinOneHour) {
                setContextMenu({ x: e.clientX, y: e.clientY, messageId: message.id })
              }
            }}
          >
            <div className={cn('flex items-end', { 'justify-end': isCurrentUser })}>
              <div
                className={cn('flex flex-col space-y-2 text-base max-w-xs mx-2', {
                  'order-1 items-end': isCurrentUser,
                  'order-2 items-start': !isCurrentUser,
                })}
              >
                <span
                  className={cn('px-4 py-2 rounded-lg inline-block', {
                    'bg-indigo-600 text-white': isCurrentUser,
                    'bg-gray-200 text-gray-900': !isCurrentUser,
                    'rounded-br-none': !hasNextMessageFromSameUser && isCurrentUser,
                    'rounded-bl-none': !hasNextMessageFromSameUser && !isCurrentUser,
                  })}
                >
                  {message.text}{' '}
                  <span className="ml-2 text-xs text-gray-400">
  {formatTimestamp(message.timestamp)}
  {message.editedAt && (
    <span className="ml-1 italic opacity-70">(edited)</span>
  )}
</span>

                </span>
              </div>

              <div
                className={cn('relative w-6 h-6', {
                  'order-2': isCurrentUser,
                  'order-1': !isCurrentUser,
                  invisible: hasNextMessageFromSameUser,
                })}
              >
                <Image
                  fill
                  src={isCurrentUser ? (sessionImg as string) : chatPartner.image}
                  alt='Profile picture'
                  referrerPolicy='no-referrer'
                  className='rounded-full'
                />
              </div>
            </div>

            {isCurrentUser && (
  <div className='flex justify-end pr-1 pt-1'>
    <span
      className={cn('text-xs select-none', {
        'text-gray-400': !message.deliveredAt && !message.readAt,   // Sent (✓)
        'text-gray-500': message.deliveredAt && !message.readAt,    // Delivered (✓✓)
        'text-green-500': message.readAt,                           // Read (✓✓ colored)
      })}
    >
      {message.readAt
        ? '✓✓'
        : message.deliveredAt
        ? '✓✓'
        : '✓'}
    </span>
  </div>
)}

          </div>
        )
      })}

      {/* 🆕 Context menu for Unsend */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
          }}
          className='bg-white border border-gray-300 rounded-md shadow-lg text-sm'
          onMouseLeave={() => setContextMenu(null)}
        >
          <>
  <button
    className='block w-full px-4 py-2 text-left text-blue-500 hover:bg-gray-100'
    onClick={() => {
      const msg = messages.find((m) => m.id === contextMenu.messageId)
      if (!msg) return
      const newText = prompt('Edit your message:', msg.text)
      if (newText && newText.trim() && newText !== msg.text) {
        fetch('/api/message/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, messageId: msg.id, newText }),
        })
      }
      setContextMenu(null)
    }}
  >
    Edit
  </button>

  <button
    className='block w-full px-4 py-2 text-left text-red-500 hover:bg-gray-100'
    onClick={async () => {
      try {
        await fetch('/api/message/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, messageId: contextMenu.messageId }),
        })
      } catch (err) {
        console.error('Failed to delete message', err)
      } finally {
        setContextMenu(null)
      }
    }}
  >
    Unsend
  </button>
</>

        </div>
      )}
    </div>
  )
}

export default Messages
