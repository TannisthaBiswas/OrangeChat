import { z } from 'zod'

export const messageValidator = z.object({
  id: z.string(),
  senderId: z.string(),
  text: z.string(),
  timestamp: z.number(),
  deliveredAt: z.number().optional(),
  readAt: z.number().optional(), 
  editedAt: z.number().optional(),
 
})

export const messageArrayValidator = z.array(messageValidator)

export type Message = z.infer<typeof messageValidator>
