import { Injectable, inject, signal, Signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Message, SendMessageDto, TaskPhase } from '../models/message.model';
import { ConversationUI } from '../models/conversation.model';
import { SseDecoder } from '../utils/sse-decoder.util';

export interface ConversationFile {
  id: string;
  name: string;
  filename: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  is_dir?: boolean;
  message_id?: string;
  created_at?: string;
  sender_type?: string;
  sender_name?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiChatService {
  private readonly http = inject(HttpClient);
  private readonly agentsUrl = '/api/v1/agents';

  /** Map holding active AbortControllers isolated per agent ID */
  private readonly abortControllersMap = new Map<string, AbortController>();

  /** Tracks which agent ID currently has an active "New Conversation" draft */
  draftAgentId: string | null = null;

  /** Map holding message arrays isolated per agent ID */
  private readonly messagesMap = signal<Record<string, Message[]>>({});

  /** Map holding active streaming states per agent ID */
  private readonly streamingMap = signal<Record<string, boolean>>({});

  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  /** Returns a reactive computed Signal for a specific agent's streaming state */
  isAgentStreaming(agentId: string): Signal<boolean> {
    return computed(() => !!this.streamingMap()[agentId]);
  }

  /** Returns a reactive computed Signal for a specific agent's messages */
  getMessagesSignal(agentId: string): Signal<Message[]> {
    return computed(() => this.messagesMap()[agentId] ?? []);
  }

  /** Sets messages for a specific agent */
  setMessages(agentId: string, messages: Message[]): void {
    this.messagesMap.update((map) => ({ ...map, [agentId]: messages }));
  }

  private setAgentStreaming(agentId: string, isStreaming: boolean): void {
    this.streamingMap.update((map) => ({ ...map, [agentId]: isStreaming }));
  }

  clearMessages(agentId?: string): void {
    if (agentId) {
      this.cancelActiveStream(agentId);
      this.messagesMap.update((map) => ({ ...map, [agentId]: [] }));
    } else {
      this.cancelAllStreams();
      this.messagesMap.set({});
    }
    this.error.set(null);
  }

  getConversations(agentId: string): Observable<ConversationUI[]> {
    return this.http.get<ConversationUI[]>(`${this.agentsUrl}/${agentId}/conversations`);
  }

  getConversationFiles(agentId: string, conversationId: string): Observable<ConversationFile[]> {
    return this.http.get<ConversationFile[]>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}/files`
    );
  }

  deleteConversation(agentId: string, conversationId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}`
    );
  }

  loadMessages(agentId: string, conversationId: string, limit = 50): void {
    if (!conversationId || !agentId) return;

    this.cancelActiveStream(agentId);
    this.isLoading.set(true);
    this.error.set(null);

    this.http
      .get<Message[]>(
        `${this.agentsUrl}/${agentId}/conversations/${conversationId}/history?limit=${limit}`
      )
      .subscribe({
        next: (data: Message[]) => {
          this.setMessages(agentId, data);
          this.isLoading.set(false);
        },
        error: (err: unknown) => {
          console.error('Failed to load messages:', err);
          this.error.set('Failed to load messages.');
          this.isLoading.set(false);
        }
      });
  }

  cancelActiveStream(agentId: string): void {
    const controller = this.abortControllersMap.get(agentId);
    if (controller) {
      controller.abort();
      this.abortControllersMap.delete(agentId);
      this.setAgentStreaming(agentId, false);
    }
  }

  cancelAllStreams(): void {
    this.abortControllersMap.forEach((controller, agentId) => {
      controller.abort();
      this.setAgentStreaming(agentId, false);
    });
    this.abortControllersMap.clear();
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

    this.cancelActiveStream(agentId);

    const abortController = new AbortController();
    this.abortControllersMap.set(agentId, abortController);

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

    const currentAgentMsgs = this.messagesMap()[agentId] ?? [];
    this.setMessages(agentId, [...currentAgentMsgs, tempUserMsg, tempAgentMsg]);
    this.setAgentStreaming(agentId, true);
    this.error.set(null);

    try {
      const { body, headers } = this.buildRequestBody(dto, files);

      const response = await fetch(`${this.agentsUrl}/${agentId}/stream`, {
        method: 'POST',
        headers,
        body,
        signal: abortController.signal
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      if (!response.body) return;

      await this.readEventStream(agentId, response.body, tempAgentMsgId, onNewConvCreated);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return;
      }
      console.error('Streaming error occurred:', err);
      this.error.set('Streaming failed.');
    } finally {
      this.setAgentStreaming(agentId, false);
      this.abortControllersMap.delete(agentId);
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
    agentId: string,
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
        this.handleRawSseEvent(agentId, rawEvent, agentMessageId, onNewConvCreated);
      }
    }

    if (buffer.trim()) {
      this.handleRawSseEvent(agentId, buffer, agentMessageId, onNewConvCreated);
    }
  }

  private updateAgentMessages(agentId: string, updateFn: (msgs: Message[]) => Message[]): void {
    const msgs = this.messagesMap()[agentId] ?? [];
    this.setMessages(agentId, updateFn(msgs));
  }

  private handleRawSseEvent(
    agentId: string,
    rawEvent: string,
    messageId: string,
    onNewConvCreated?: (newId: string) => void
  ): void {
    const payload = SseDecoder.extractDataPayload(rawEvent);
    if (!payload) return;

    const event = SseDecoder.parseEvent(payload);

    switch (event.type) {
      case 'meta':
        this.updateAgentMessages(agentId, (prev) =>
          prev.map((m) => (!m.conversation_id ? { ...m, conversation_id: event.conversationId } : m))
        );
        onNewConvCreated?.(event.conversationId);
        break;

      case 'attachments':
        this.updateAgentMessages(agentId, (prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, attachments: [...(m.attachments || []), ...event.attachments] }
              : m
          )
        );
        break;

      case 'task_chain_init':
        this.updateAgentMessages(agentId, (prev) =>
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
        this.updateAgentMessages(agentId, (prev) =>
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
        this.updateAgentMessages(agentId, (prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, text: m.text + event.text } : m))
        );
        break;

      case 'done':
        break;
    }
  }

  createConversationFolder(
    agentId: string,
    conversationId: string,
    folderPath: string
  ): Observable<ConversationFile> {
    return this.http.post<ConversationFile>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}/folders`,
      { path: folderPath }
    );
  }

  deleteConversationFolder(
    agentId: string,
    conversationId: string,
    folderPath: string
  ): Observable<void> {
    return this.http.delete<void>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}/folders`,
      { body: { path: folderPath } }
    );
  }

  deleteConversationFile(
    agentId: string,
    conversationId: string,
    filePath: string
  ): Observable<void> {
    return this.http.delete<void>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}/files`,
      { body: { path: filePath } }
    );
  }

  uploadConversationFiles(
    agentId: string,
    conversationId: string,
    files: File[],
    folderPath: string = ''
  ): Observable<{ uploaded: string[] }> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('folder_path', folderPath);

    return this.http.post<{ uploaded: string[] }>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}/files/upload`,
      formData
    );
  }

  getFileDownloadUrl(conversationId: string, filePath: string): string {
    return `/api/v1/chat/conversations/${conversationId}/files/${encodeURIComponent(filePath)}`;
  }

  deleteMessage(agentId: string, conversationId: string, messageId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}/messages/${messageId}`
    );
  }

  clearConversationMessages(agentId: string, conversationId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}/messages`
    );
  }

  updateConversationTitle(
    agentId: string,
    conversationId: string,
    title: string
  ): Observable<ConversationUI> {
    return this.http.patch<ConversationUI>(
      `${this.agentsUrl}/${agentId}/conversations/${conversationId}`,
      { title }
    );
  }
}