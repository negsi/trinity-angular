import { TaskItem } from './task-chain.model';

/**
 * Actor sending the message.
 */
export type ActorType = 'user' | 'agent' | 'system';

/**
 * File attachment associated with a message.
 */
export interface MessageAttachment {
  id: string;
  name: string;
  filename: string;
  mime_type: string;
  file_size: number;
  message_id?: string;
}

/**
 * Complete chat message model.
 */
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: ActorType;
  sender_name: string;
  text: string;
  recipient_id?: string | null;
  timestamp: string;
  attachments?: MessageAttachment[];
  taskChain?: TaskItem[];
}

/**
 * DTO payload for sending a chat message.
 */
export interface SendMessageDto {
  conversation_id?: string;
  sender_id: string;
  sender_type: ActorType;
  sender_name: string;
  text: string;
  recipient_id?: string | null;
}

/**
 * UI representation of a chat message in the chat workspace.
 */
export interface ChatMessageUI {
  id: string;
  sender: 'other' | 'me';
  senderName: string;
  avatarBg: string;
  avatarInitials: string;
  text: string;
  time: string;
  isRead?: boolean;
  attachments?: MessageAttachment[];
  taskChain?: TaskItem[];
}

/**
 * Messages grouped by date label for display.
 */
export interface MessageGroup {
  dateLabel: string;
  messages: ChatMessageUI[];
}