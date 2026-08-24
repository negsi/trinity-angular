import { TaskItem } from './task-chain.model';

export type ActorType = 'user' | 'agent' | 'system';

export interface MessageAttachment {
  id: string;
  name: string;
  filename: string;
  mime_type: string;
  file_size: number;
  file_path?: string;
  message_id?: string;
}

export interface TaskPhase {
  phaseIndex: number;
  callDepth?: number;  
  agentId?: string;
  steps: TaskItem[];
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
  taskPhases?: TaskPhase[];
}

export interface SendMessageDto {
  conversation_id?: string;
  sender_id?: string;
  sender_type?: ActorType;
  sender_name?: string;
  text?: string;
  recipient_id?: string;
}

export interface ChatMessageUI {
  id: string;
  sender: 'other' | 'me';
  senderName: string;
  avatarBg: string;
  avatarInitials: string;
  text: string;
  time: string;
  isRead?: boolean;
  attachments: MessageAttachment[];
  taskPhases: TaskPhase[];
}

export interface MessageGroup {
  dateLabel: string;
  messages: ChatMessageUI[];
}