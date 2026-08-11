export type ActorType = 'user' | 'agent' | 'system';

export interface MessageAttachment {
  id: string;
  name: string;
  filename: string;
  mime_type: string;
  file_size: number;
  message_id?: string;
}

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
}

export interface SendMessageDto {
  conversation_id: string;
  sender_id: string;
  sender_type: ActorType;
  sender_name: string;
  text: string;
  recipient_id?: string | null;
}