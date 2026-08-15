/**
 * Conversation entity model.
 */
export interface Conversation {
  id: string;
  agent_id: string;
  title: string;
  created_at: string;
}

/**
 * UI representation of a conversation item.
 */
export interface ConversationUI {
  id: string;
  agent_id: string;
  title: string;
  created_at: string;
}