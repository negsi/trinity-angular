import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Message, SendMessageDto, TaskPhase } from '../models/message.model';
import { ConversationUI } from '../models/conversation.model';
import { SseDecoder } from '../utils/sse-decoder.util';

@Injectable({
  providedIn: 'root'
})
export class ApiChatService {
  private readonly http = inject(HttpClient);
  private readonly agentsUrl = '/api/v1/agents';

  private activeAbortController: AbortController | null = null;

  readonly messages = signal<Message[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isStreaming = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  clearMessages(): void {
    this.cancelActiveStream();
    this.messages.set([]);
    this.error.set(null);
  }

  getConversations(agentId: string): Observable<ConversationUI[]> {
    return this.http.get<ConversationUI[]>(`${this.agentsUrl}/${agentId}/conversations`);
  }

  deleteConversation(agentId: string, conversationId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}`
    );
  }

  loadMessages(agentId: string, conversationId: string, limit = 50): void {
    if (!conversationId || !agentId) return;

    this.cancelActiveStream();
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
   * Bricht einen eventuell noch laufenden SSE-Stream sauber ab.
   */
  cancelActiveStream(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      this.isStreaming.set(false);
    }
  }

  async sendMessage(
    dto: SendMessageDto,
    agentName: string,
    files: File[] = [],
    onNewConvCreated?: (newId: string) => void
  ): Promise<void> {
    const agentId = dto.recipient_id;
    if (!agentId) {
      console.error('Missing agent_id (recipient_id) in sendMessage payload.');
      return;
    }

    this.cancelActiveStream();
    this.activeAbortController = new AbortController();

    const tempUserMsg: Message = {
      id: `user-${Date.now()}`,
      conversation_id: dto.conversation_id || '',
      sender_id: dto.sender_id || 'user',
      sender_type: 'user',
      sender_name: dto.sender_name || 'User',
      text: dto.text || '',
      recipient_id: agentId,
      timestamp: new Date().toISOString(),
      attachments: files.map((f) => ({
        id: `att-${Date.now()}-${f.name}`,
        name: f.name,
        filename: f.name,
        file_size: f.size,
        mime_type: f.type
      }))
    };

    const tempAgentMsgId = `stream-${Date.now()}`;
    const tempAgentMsg: Message = {
      id: tempAgentMsgId,
      conversation_id: dto.conversation_id || '',
      sender_id: agentId,
      sender_type: 'agent',
      sender_name: agentName,
      text: '',
      recipient_id: dto.sender_id || 'user',
      timestamp: new Date().toISOString(),
      attachments: [],
      taskPhases: []
    };

    this.messages.update((prev) => [...prev, tempUserMsg, tempAgentMsg]);
    this.isStreaming.set(true);
    this.error.set(null);

    try {
      const { body, headers } = this.buildRequestBody(dto, files);

      const response = await fetch(`${this.agentsUrl}/${agentId}/stream`, {
        method: 'POST',
        headers,
        body,
        signal: this.activeAbortController.signal
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      if (!response.body) return;

      await this.readEventStream(response.body, tempAgentMsgId, onNewConvCreated);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return; // Normaler Benutzer-Abbruch
      }
      console.error('Streaming error occurred:', err);
      this.error.set('Streaming failed.');
    } finally {
      this.isStreaming.set(false);
      this.activeAbortController = null;
    }
  }

  private buildRequestBody(
    dto: SendMessageDto,
    files: File[]
  ): { body: FormData | string; headers: Record<string, string> } {
    if (files.length > 0) {
      const formData = new FormData();
      formData.append('text', dto.text || '');
      if (dto.conversation_id) {
        formData.append('conversation_id', dto.conversation_id);
      }
      files.forEach((file) => formData.append('files', file));
      return { body: formData, headers: {} };
    }

    return {
      body: JSON.stringify({
        text: dto.text || '',
        conversation_id: dto.conversation_id || undefined
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  private async readEventStream(
    stream: ReadableStream<Uint8Array>,
    agentMessageId: string,
    onNewConvCreated?: (newId: string) => void
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const rawEvent of events) {
        this.handleRawSseEvent(rawEvent, agentMessageId, onNewConvCreated);
      }
    }

    if (buffer.trim()) {
      this.handleRawSseEvent(buffer, agentMessageId, onNewConvCreated);
    }
  }

  private handleRawSseEvent(
    rawEvent: string,
    messageId: string,
    onNewConvCreated?: (newId: string) => void
  ): void {
    const payload = SseDecoder.extractDataPayload(rawEvent);
    if (!payload) return;

    const event = SseDecoder.parseEvent(payload);

    switch (event.type) {
      case 'meta':
        this.messages.update((prev) =>
          prev.map((m) => (!m.conversation_id ? { ...m, conversation_id: event.conversationId } : m))
        );
        onNewConvCreated?.(event.conversationId);
        break;

      case 'attachments':
        this.messages.update((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, attachments: [...(m.attachments || []), ...event.attachments] }
              : m
          )
        );
        break;

      case 'task_chain_init':
        this.messages.update((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const currentPhases = m.taskPhases || [];
            const newPhase: TaskPhase = {
              phaseIndex: currentPhases.length + 1,
              steps: event.steps
            };
            return { ...m, taskPhases: [...currentPhases, newPhase] };
          })
        );
        break;

      case 'task_step_update':
        this.messages.update((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  taskPhases: SseDecoder.applyTaskStepUpdate(
                    m.taskPhases || [],
                    event.stepNumber,
                    event.status
                  )
                }
              : m
          )
        );
        break;

      case 'text_chunk':
        this.messages.update((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, text: m.text + event.text } : m))
        );
        break;

      case 'done':
        break;
    }
  }
}