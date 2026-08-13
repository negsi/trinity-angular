import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Message, SendMessageDto } from '../models/message.model';
import { ConversationUI } from '../components/conversation-drawer/conversation-drawer';

@Injectable({
  providedIn: 'root'
})
export class ApiChatService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/chat';
  private readonly agentsUrl = '/api/v1/agents';

  readonly messages = signal<Message[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isStreaming = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  /**
   * Leert die aktuell geladenen Nachrichten im Signal.
   */
  clearMessages(): void {
    this.messages.set([]);
    this.error.set(null);
  }

  /**
   * Lädt alle Konversationen für einen bestimmten Agenten.
   */
  getConversations(agentId: string): Observable<ConversationUI[]> {
    return this.http.get<ConversationUI[]>(`${this.agentsUrl}/${agentId}/conversations`);
  }

  /**
   * Löscht eine Konversation anhand ihrer ID.
   */
  deleteConversation(agentId: string, conversationId: string): Observable<void> {
    if (!agentId || !conversationId) {
      throw new Error('agentId und conversationId müssen übergeben werden.');
    }

    // Ruft jetzt /api/v1/agents/<agent_id>/conversations/<conversation_id> auf
    return this.http.delete<void>(`${this.agentsUrl}/${agentId}/conversations/${conversationId}`);
  }

  loadMessages(agentId: string, conversationId: string, limit: number = 50): void {
    if (!conversationId || !agentId) return;

    this.isLoading.set(true);
    this.error.set(null);

    // Neuer Pfad über die agents.py Route:
    this.http.get<Message[]>(`${this.agentsUrl}/${agentId}/conversations/${conversationId}/history?limit=${limit}`).subscribe({
      next: (data) => {
        this.messages.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Fehler beim Laden der Nachrichten:', err);
        this.error.set('Nachrichten konnten nicht geladen werden.');
        this.isLoading.set(false);
      }
    });
  }

  sendMessage(dto: SendMessageDto, agentName: string, files: File[] = [], onNewConvCreated?: (newId: string) => void): void {
    let payload: SendMessageDto | FormData = dto;

    if (files.length > 0) {
      const formData = new FormData();
      // 💡 Nur anhängen, wenn eine conversation_id existiert!
      if (dto.conversation_id) {
        formData.append('conversation_id', dto.conversation_id);
      }
      formData.append('sender_id', dto.sender_id);
      formData.append('sender_type', dto.sender_type);
      formData.append('sender_name', dto.sender_name);
      formData.append('text', dto.text || '');
      if (dto.recipient_id) formData.append('recipient_id', dto.recipient_id);

      files.forEach(file => {
        formData.append('files', file);
      });

      payload = formData;
    }

    this.http.post<Message>(`${this.baseUrl}/messages`, payload).subscribe({
      next: (savedUserMsg) => {
        this.messages.update(prev => [...prev, savedUserMsg]);

        // Callback ausführen, falls eine neue Conversation gestartet wurde
        if (onNewConvCreated && savedUserMsg.conversation_id) {
          onNewConvCreated(savedUserMsg.conversation_id);
        }

        this.streamAgentResponse(
          dto.text,
          savedUserMsg.conversation_id,
          dto.recipient_id!,
          agentName,
          dto.sender_id
        );
      },
      error: (err) => {
        console.error('Fehler beim Senden der Nachricht:', err);
        this.error.set('Fehler beim Senden der Nachricht.');
      }
    });
  }

  private async streamAgentResponse(
    userText: string,
    conversationId: string,
    agentId: string,
    agentName: string,
    userId: string
  ): Promise<void> {
    const tempAgentMsgId = 'stream-' + Date.now();

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

    this.messages.update(prev => [...prev, agentMsg]);
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

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) return;

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
          this.messages.update(prev =>
            prev.map(m => (m.id === tempAgentMsgId ? { ...m, text: m.text + chunkText } : m))
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
          this.messages.update(prev =>
            prev.map(m => (m.id === tempAgentMsgId ? { ...m, text: m.text + finalContent } : m))
          );
        }
      }

    } catch (err) {
      console.error('Streaming-Fehler:', err);
      this.error.set('Streaming fehlgeschlagen.');
    } finally {
      this.isStreaming.set(false);
    }
  }
}