import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Message, SendMessageDto, TaskPhase } from '../models/message.model';
import { ConversationUI } from '../models/conversation.model';

/**
 * Service managing chat messaging, conversation histories, and streaming responses.
 */
@Injectable({
  providedIn: 'root'
})
export class ApiChatService {
  private readonly http = inject(HttpClient);
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
   */
  getConversations(agentId: string): Observable<ConversationUI[]> {
    return this.http.get<ConversationUI[]>(`${this.agentsUrl}/${agentId}/conversations`);
  }

  /**
   * Deletes a conversation from an agent's history.
   */
  deleteConversation(agentId: string, conversationId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}`
    );
  }

  /**
   * Loads message history for a conversation.
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
   * Dispatches a user message and consumes the SSE stream from POST /api/v1/agents/<agent_id>/stream.
   */
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

    // 1. Optimistischer UI-Eintrag für die User-Nachricht
    const tempUserMsg: Message = {
      id: `user-${Date.now()}`,
      conversation_id: dto.conversation_id || '',
      sender_id: 'user',
      sender_type: 'user',
      sender_name: dto.sender_name || 'User',
      text: dto.text || '',
      recipient_id: agentId,
      timestamp: new Date().toISOString(),
      attachments: files.map((f) => ({
        id: `att-${Date.now()}-${f.name}`,
        name: f.name,
        filename: f.name,
        file_path: '',
        file_size: f.size,
        mime_type: f.type
      }))
    };

    // 2. Platzhalter für die kommende Agent-Antwort vorbereiten
    const tempAgentMsgId = `stream-${Date.now()}`;
    const tempAgentMsg: Message = {
      id: tempAgentMsgId,
      conversation_id: dto.conversation_id || '',
      sender_id: agentId,
      sender_type: 'agent',
      sender_name: agentName,
      text: '',
      recipient_id: 'user',
      timestamp: new Date().toISOString(),
      attachments: []
    };

    this.messages.update((prev) => [...prev, tempUserMsg, tempAgentMsg]);
    this.isStreaming.set(true);
    this.error.set(null);

    try {
      // 3. Single Pipeline Request: Payload zusammenstellen
      let body: FormData | string;
      const headers: Record<string, string> = {};

      if (files.length > 0) {
        const formData = new FormData();
        formData.append('text', dto.text || '');
        if (dto.conversation_id) {
          formData.append('conversation_id', dto.conversation_id);
        }
        files.forEach((file) => formData.append('files', file));
        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          text: dto.text || '',
          conversation_id: dto.conversation_id || undefined
        });
      }

      // 4. SSE Stream anfordern
      const response = await fetch(`${this.agentsUrl}/${agentId}/stream`, {
        method: 'POST',
        headers,
        body
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

        for (const event of events) {
          this.processSseEvent(event, tempAgentMsgId, onNewConvCreated);
        }
      }

      if (buffer.trim()) {
        this.processSseEvent(buffer, tempAgentMsgId, onNewConvCreated);
      }
    } catch (err: unknown) {
      console.error('Streaming error occurred:', err);
      this.error.set('Streaming failed.');
    } finally {
      this.isStreaming.set(false);
    }
  }

  /**
   * Processes individual SSE events (meta, task chains, attachments, plain text chunks).
   */
  private processSseEvent(
    rawEvent: string,
    messageId: string,
    onNewConvCreated?: (newId: string) => void
  ): void {
    const lines = rawEvent.split('\n');
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5));
      } else if (line.trim() && !line.startsWith(':')) {
        dataLines.push(line);
      }
    }

    if (dataLines.length === 0) {
      return;
    }

    const content = dataLines.join('\n');

    if (content === '[DONE]') {
      return;
    }

    // 1. Meta-Event Handling (Erstes Event mit Server-generierter conversation_id & user_message_id)
    try {
      if (content.startsWith('{')) {
        const parsed = JSON.parse(content);
        if (parsed.type === 'meta' && parsed.data?.conversation_id) {
          const newConvId = parsed.data.conversation_id;
          
          // Aktualisiere conversation_id in allen temporären UI-Nachrichten
          this.messages.update((prev) =>
            prev.map((m) => (!m.conversation_id ? { ...m, conversation_id: newConvId } : m))
          );

          if (onNewConvCreated) {
            onNewConvCreated(newConvId);
          }
          return;
        }
      }
    } catch {
      // Kein Meta-JSON, normal weiterverarbeiten
    }

    // 2. Attachments handling
    if (content.includes('__ATTACHMENTS__:')) {
      const jsonStart = content.indexOf('__ATTACHMENTS__:') + '__ATTACHMENTS__:'.length;
      const jsonStr = content.substring(jsonStart).trim();

      try {
        const payload = JSON.parse(jsonStr);
        if (payload.type === 'attachments' && Array.isArray(payload.files)) {
          this.messages.update((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, attachments: [...(m.attachments || []), ...payload.files] }
                : m
            )
          );
        }
      } catch (e) {
        console.error('Failed to parse attachments SSE payload:', e, jsonStr);
      }
      return;
    }

    // 3. Task chain handling
    if (content.includes('__TASK_CHAIN__:')) {
      const jsonStart = content.indexOf('__TASK_CHAIN__:') + '__TASK_CHAIN__:'.length;
      const jsonStr = content.substring(jsonStart).trim();

      try {
        const payload = JSON.parse(jsonStr);

        if (payload.type === 'task_chain_init' && Array.isArray(payload.steps)) {
          this.messages.update((prev) =>
            prev.map((m) => {
              if (m.id !== messageId) return m;

              const currentPhases = m.taskPhases || [];
              const newPhase: TaskPhase = {
                phaseIndex: currentPhases.length + 1,
                steps: payload.steps
              };

              return { ...m, taskPhases: [...currentPhases, newPhase] };
            })
          );
        } else if (payload.type === 'task_step_update') {
          const stepNum = payload.step_number;

          this.messages.update((prev) =>
            prev.map((m) => {
              if (m.id !== messageId || !m.taskPhases || m.taskPhases.length === 0) return m;

              const updatedPhases = [...m.taskPhases];
              const lastPhaseIndex = updatedPhases.length - 1;
              const targetPhase = updatedPhases[lastPhaseIndex];

              const updatedSteps = targetPhase.steps.map((task) =>
                task.step_number === stepNum ? { ...task, status: payload.status } : task
              );

              updatedPhases[lastPhaseIndex] = { ...targetPhase, steps: updatedSteps };

              return { ...m, taskPhases: updatedPhases };
            })
          );
        }
      } catch (e) {
        console.error('Failed to parse task chain SSE payload:', e, jsonStr);
      }
      return;
    }

    // 4. Normal text stream
    this.messages.update((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, text: m.text + content } : m
      )
    );
  }
}
