import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Message, SendMessageDto } from '../models/message.model';
import { ConversationUI } from '../models/conversation.model';

/**
 * Service managing chat messaging, conversation histories, and streaming responses.
 */
@Injectable({
  providedIn: 'root'
})
export class ApiChatService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/chat';
  private readonly agentsUrl = '/api/v1/agents';

  /** Signal containing the current message list */
  readonly messages = signal<Message[]>([]);

  /** Signal indicating active message loading */
  readonly isLoading = signal<boolean>(false);

  /** Signal indicating an active SSE streaming response */
  readonly isStreaming = signal<boolean>(false);

  /** Signal containing the latest error state */
  readonly error = signal<string | null>(null);

  /**
   * Clears the current active messages and resets error signals.
   */
  clearMessages(): void {
    this.messages.set([]);
    this.error.set(null);
  }

  /**
   * Retrieves all conversations for a specific agent.
   *
   * @param agentId - The agent's unique identifier.
   * @returns Observable emitting the conversation list.
   */
  getConversations(agentId: string): Observable<ConversationUI[]> {
    return this.http.get<ConversationUI[]>(`${this.agentsUrl}/${agentId}/conversations`);
  }

  /**
   * Deletes a conversation from an agent's history.
   *
   * @param agentId - The agent's identifier.
   * @param conversationId - The conversation identifier.
   * @returns Observable emitting upon completion.
   */
  deleteConversation(agentId: string, conversationId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}`
    );
  }

  /**
   * Loads message history for a conversation.
   *
   * @param agentId - The agent's identifier.
   * @param conversationId - The conversation identifier.
   * @param limit - Max number of messages to fetch.
   */
  loadMessages(agentId: string, conversationId: string, limit = 50): void {
    if (!conversationId || !agentId) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    this.http
      .get<Message[]>(
        `${this.agentsUrl}/${agentId}/conversations/${conversationId}/history?limit=${limit}`
      )
      .subscribe({
        next: (data: Message[]) => {
          this.messages.set(data);
          this.isLoading.set(false);
        },
        error: (err: unknown) => {
          console.error('Failed to load messages:', err);
          this.error.set('Failed to load messages.');
          this.isLoading.set(false);
        }
      });
  }

  /**
   * Dispatches a user message and starts receiving the streaming response.
   *
   * @param dto - Message transfer payload.
   * @param agentName - Active agent's name.
   * @param files - Optional list of file attachments.
   * @param onNewConvCreated - Optional callback triggered when a new conversation ID is assigned.
   */
  sendMessage(
    dto: SendMessageDto,
    agentName: string,
    files: File[] = [],
    onNewConvCreated?: (newId: string) => void
  ): void {
    let payload: SendMessageDto | FormData = dto;

    if (files.length > 0) {
      const formData = new FormData();
      if (dto.conversation_id) {
        formData.append('conversation_id', dto.conversation_id);
      }
      formData.append('sender_id', dto.sender_id);
      formData.append('sender_type', dto.sender_type);
      formData.append('sender_name', dto.sender_name);
      formData.append('text', dto.text || '');
      if (dto.recipient_id) {
        formData.append('recipient_id', dto.recipient_id);
      }

      files.forEach((file) => {
        formData.append('files', file);
      });

      payload = formData;
    }

    this.http.post<Message>(`${this.baseUrl}/messages`, payload).subscribe({
      next: (savedUserMsg: Message) => {
        this.messages.update((prev) => [...prev, savedUserMsg]);

        if (onNewConvCreated && savedUserMsg.conversation_id) {
          onNewConvCreated(savedUserMsg.conversation_id);
        }

        void this.streamAgentResponse(
          dto.text,
          savedUserMsg.conversation_id,
          dto.recipient_id ?? '',
          agentName,
          dto.sender_id
        );
      },
      error: (err: unknown) => {
        console.error('Failed to send message:', err);
        this.error.set('Failed to send message.');
      }
    });
  }

  /**
   * Consumes an SSE stream from the backend and appends chunks reactively.
   */
  private async streamAgentResponse(
    userText: string,
    conversationId: string,
    agentId: string,
    agentName: string,
    userId: string
  ): Promise<void> {
    const tempAgentMsgId = `stream-${Date.now()}`;

    const agentMsg: Message = {
      id: tempAgentMsgId,
      conversation_id: conversationId,
      sender_id: agentId,
      sender_type: 'agent',
      sender_name: agentName,
      text: '',
      recipient_id: userId,
      timestamp: new Date().toISOString()
    };

    this.messages.update((prev) => [...prev, agentMsg]);
    this.isStreaming.set(true);

    try {
      const response = await fetch(`${this.baseUrl}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          conversation_id: conversationId,
          agent_id: agentId,
          agent_name: agentName,
          user_id: userId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      if (!response.body) {
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        let chunkText = '';

        for (const event of events) {
          const lines = event.split('\n');
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              dataLines.push(line.slice(6));
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5));
            }
          }

          if (dataLines.length > 0) {
            const eventContent = dataLines.join('\n');
            if (eventContent !== '[DONE]') {
              chunkText += eventContent;
            }
          }
        }

        if (chunkText) {
          this.messages.update((prev) =>
            prev.map((m) =>
              m.id === tempAgentMsgId ? { ...m, text: m.text + chunkText } : m
            )
          );
        }
      }

      if (buffer.trim()) {
        const lines = buffer.split('\n');
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith('data: ')) dataLines.push(line.slice(6));
          else if (line.startsWith('data:')) dataLines.push(line.slice(5));
        }
        const finalContent = dataLines.join('\n');
        if (finalContent && finalContent !== '[DONE]') {
          this.messages.update((prev) =>
            prev.map((m) =>
              m.id === tempAgentMsgId ? { ...m, text: m.text + finalContent } : m
            )
          );
        }
      }
    } catch (err: unknown) {
      console.error('Streaming error occurred:', err);
      this.error.set('Streaming failed.');
    } finally {
      this.isStreaming.set(false);
    }
  }
}
