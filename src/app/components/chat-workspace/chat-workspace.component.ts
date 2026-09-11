import {
  Component,
  input,
  signal,
  inject,
  effect,
  computed,
  viewChild,
  ElementRef,
  afterNextRender,
  Injector,
  DestroyRef,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarkdownModule } from 'ngx-markdown';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';

import { ApiAgentService } from '../../services/agent.service';
import { ApiChatService } from '../../services/chat.service';
import { UserContextService } from '../../services/user-context.service';
import { SendMessageDto, ChatMessageUI, MessageGroup } from '../../models/message.model';
import { ConversationUI } from '../../models/conversation.model';
import { ConversationDrawerComponent } from '../conversation-drawer/conversation-drawer.component';
import { TaskChainListComponent } from '../task-chain-list/task-chain-list.component';
import { Agent } from '../../models/agent.model';
import { getInitials, getAvatarColor } from '../../utils/avatar.util';
import { formatDateLabel } from '../../utils/date.util';
import { stripMarkdown } from '../../utils/text.util';

/**
 * Main chat workspace component orchestrating streaming interaction and message rendering.
 */
@Component({
  selector: 'app-chat-workspace',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MarkdownModule,
    ConversationDrawerComponent,
    TaskChainListComponent
  ],
  templateUrl: './chat-workspace.component.html',
  styleUrl: './chat-workspace.component.scss'
})
export class ChatWorkspaceComponent {
  /** Mode indicator signal */
  readonly isLightMode = input.required<boolean>();

  /** Optional agent override for multi-agent crew layout */
  readonly overrideAgent = input<Agent | null>(null);

  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly userService = inject(UserContextService);
  readonly agentService = inject(ApiAgentService);
  readonly chatService = inject(ApiChatService);

  readonly scrollContainer = viewChild<ElementRef<HTMLDivElement>>('scrollContainer');
  readonly chatTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('chatTextarea');

  // Input & UI State Signals
  readonly currentInput = signal<string>('');
  readonly selectedFiles = signal<File[]>([]);
  readonly isExpanded = signal<boolean>(false);
  readonly isFullscreen = signal<boolean>(false);

  // Drawer Signals
  readonly isDrawerOpen = signal<boolean>(false);
  readonly conversationsList = signal<ConversationUI[]>([]);
  readonly activeConversationId = signal<string | null>(null);

  // Smart Auto-Scroll State Signal
  readonly userHasScrolledUp = signal<boolean>(false);

  // Active Agent computation (Override vs Global Selection)
  readonly activeAgent = computed<Agent | null>(() => this.overrideAgent() ?? this.agentService.selectedAgent());

  /** Streaming state computed specifically for this active agent */
  readonly isCurrentAgentStreaming = computed<boolean>(() => {
    const agent = this.activeAgent();
    return agent ? this.chatService.isAgentStreaming(agent.id)() : false;
  });

  // Shared Helper Functions for Template
  readonly getInitials = getInitials;
  readonly getAvatarBg = getAvatarColor;

  @ViewChild('chatTextarea') chatTextareaRef?: ElementRef<HTMLTextAreaElement>;

  /**
   * Computed flag checking whether current input text exceeds single line.
   */
  readonly isMultiLine = computed<boolean>(() => {
    const text = this.currentInput();
    return text.includes('\n');
  });

  /**
   * Computed message groups structured with relative date headers for this specific active agent.
   */
  readonly messageGroups = computed<MessageGroup[]>(() => {
    const currentAgent = this.activeAgent();
    if (!currentAgent) return [];

    const rawMessages = this.chatService.getMessagesSignal(currentAgent.id)();
    if (!rawMessages || rawMessages.length === 0) return [];

    const groupsMap = new Map<string, ChatMessageUI[]>();

    for (const msg of rawMessages) {
      const dateObj = new Date(msg.timestamp);
      const dateLabel = formatDateLabel(dateObj);

      const uiMsg: ChatMessageUI = {
        id: msg.id,
        sender: msg.sender_type === 'user' ? 'me' : 'other',
        senderName: msg.sender_name,
        avatarBg: getAvatarColor(msg.sender_name),
        avatarInitials: getInitials(msg.sender_name),
        text: msg.text,
        time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: true,
        attachments: msg.attachments ?? [],
        taskPhases: msg.taskPhases ?? []
      };

      if (!groupsMap.has(dateLabel)) {
        groupsMap.set(dateLabel, []);
      }
      groupsMap.get(dateLabel)!.push(uiMsg);
    }

    return Array.from(groupsMap.entries()).map(([dateLabel, messages]) => ({
      dateLabel,
      messages
    }));
  });

  constructor() {
    // Keep agentService activeConversationId synced with component state
    effect(() => {
      const convId = this.activeConversationId();
      this.agentService.setActiveConversation(convId);
    });

    // Race-condition-free conversation loading when active agent changes
    toObservable(this.activeAgent)
      .pipe(
        filter((agent): agent is Agent => !!agent),
        switchMap((agent) => {
          this.chatService.cancelActiveStream(agent.id);
          return this.chatService.getConversations(agent.id);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (convs: ConversationUI[]) => {
          this.conversationsList.set(convs);
          const currentAgent = this.activeAgent();

          if (currentAgent && this.chatService.draftAgentId === currentAgent.id) {
            this.activeConversationId.set(null);
            this.chatService.clearMessages(currentAgent.id);
            return;
          }

          if (convs && convs.length > 0 && currentAgent) {
            const latestConv = convs[0];
            this.activeConversationId.set(latestConv.id);
            this.chatService.loadMessages(currentAgent.id, latestConv.id);
          } else if (currentAgent) {
            this.activeConversationId.set(null);
            this.chatService.clearMessages(currentAgent.id);
          }
        },
        error: (err: unknown) => {
          console.error('Error loading conversations:', err);
          const currentAgent = this.activeAgent();
          this.activeConversationId.set(null);
          if (currentAgent) {
            this.chatService.clearMessages(currentAgent.id);
          }
        }
      });

    // Native Zoneless Auto-Scroll
    effect(() => {
      const groups = this.messageGroups();

      if (groups.length > 0 && !this.userHasScrolledUp()) {
        requestAnimationFrame(() => {
          this.scrollToBottom();
        });
      }
    });

    // Automatically focus textarea after streaming completes for this agent
    effect(() => {
      const streaming = this.isCurrentAgentStreaming();
      if (!streaming) {
        requestAnimationFrame(() => {
          this.chatTextarea()?.nativeElement.focus();
        });
      }
    });

    effect(() => {
      const agent = this.agentService.selectedAgent();
      if (agent) {
        setTimeout(() => this.focusInput(), 50);
      }
    });
  }

  onScroll(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;

    const threshold = 100;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

    this.userHasScrolledUp.set(!isNearBottom);
  }

  toggleFullscreen(): void {
    this.isFullscreen.update((v) => !v);
  }

  toggleConversationsDrawer(): void {
    const nextState = !this.isDrawerOpen();
    this.isDrawerOpen.set(nextState);
    if (nextState) {
      this.loadConversations();
    }
  }

  loadConversations(): void {
    const currentAgent = this.activeAgent();
    if (!currentAgent) return;

    this.chatService.getConversations(currentAgent.id).subscribe({
      next: (convs: ConversationUI[]) => this.conversationsList.set(convs),
      error: (err: unknown) => console.error('Failed to load conversations:', err)
    });
  }

  onSelectConversation(conversationId: string): void {
    const currentAgent = this.activeAgent();
    if (!currentAgent) return;

    if (this.chatService.draftAgentId === currentAgent.id) {
      this.chatService.draftAgentId = null;
    }

    this.userHasScrolledUp.set(false);
    this.activeConversationId.set(conversationId);
    this.chatService.loadMessages(currentAgent.id, conversationId);
    this.isDrawerOpen.set(false);
  }

  onNewConversation(): void {
    const currentAgent = this.activeAgent();
    if (currentAgent) {
      this.chatService.draftAgentId = currentAgent.id;
      this.chatService.clearMessages(currentAgent.id);
    }

    this.userHasScrolledUp.set(false);
    this.activeConversationId.set(null);
    this.isDrawerOpen.set(false);

    afterNextRender(
      () => {
        this.chatTextarea()?.nativeElement.focus();
      },
      { injector: this.injector }
    );
  }

  onFilesSelected(event: Event): void {
    if (this.isCurrentAgentStreaming()) return;

    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const newFiles = Array.from(input.files);
      this.selectedFiles.update((prev) => [...prev, ...newFiles]);
      input.value = '';
    }
  }

  removeFile(index: number): void {
    if (this.isCurrentAgentStreaming()) return;
    this.selectedFiles.update((prev) => prev.filter((_, i) => i !== index));
  }

  toggleExpand(): void {
    this.isExpanded.update((v) => !v);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!this.isCurrentAgentStreaming()) {
        this.sendMessage();
      }
    }
  }

  adjustTextareaHeight(): void {
    const el = this.chatTextarea()?.nativeElement;
    if (el) {
      el.style.height = 'auto';
      const singleLineHeight = 24;
      if (el.scrollHeight > singleLineHeight + 4) {
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      } else {
        el.style.height = '';
      }
    }
  }

  sendMessage(): void {
    if (this.isCurrentAgentStreaming()) return;

    const text = this.currentInput().trim();
    const files = this.selectedFiles();
    const currentAgent = this.activeAgent();
    const user = this.userService.currentUser();

    if ((!text && files.length === 0) || !currentAgent) return;

    const payload: SendMessageDto = {
      conversation_id: this.activeConversationId() ?? undefined,
      sender_id: user.id,
      sender_type: 'user',
      sender_name: user.name,
      text: text,
      recipient_id: currentAgent.id
    };

    this.userHasScrolledUp.set(false);
    this.currentInput.set('');
    this.selectedFiles.set([]);
    this.isExpanded.set(false);

    const textareaEl = this.chatTextarea()?.nativeElement;
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }

    void this.chatService.sendMessage(payload, currentAgent.name, files, (newConvId: string) => {
      if (this.chatService.draftAgentId === currentAgent.id) {
        this.chatService.draftAgentId = null;
      }
      this.activeConversationId.set(newConvId);
      this.loadConversations();
    });
  }

  stopStreaming(): void {
    const currentAgent = this.activeAgent();
    if (currentAgent) {
      this.chatService.cancelActiveStream(currentAgent.id);
    }
  }

  copyAsPlainText(markdownText: string): void {
    const plainText = stripMarkdown(markdownText);
    if (plainText) {
      void navigator.clipboard.writeText(plainText);
    }
  }

  copyAsMarkdown(markdownText: string): void {
    if (markdownText) {
      void navigator.clipboard.writeText(markdownText);
    }
  }

  resendMessage(msgText: string): void {
    if (this.isCurrentAgentStreaming()) return;

    const currentAgent = this.activeAgent();
    const user = this.userService.currentUser();
    if (!currentAgent || !msgText) return;

    const payload: SendMessageDto = {
      conversation_id: this.activeConversationId() ?? undefined,
      sender_id: user.id,
      sender_type: 'user',
      sender_name: user.name,
      text: msgText,
      recipient_id: currentAgent.id
    };

    this.userHasScrolledUp.set(false);
    void this.chatService.sendMessage(payload, currentAgent.name, []);
  }

  onDeleteConversation(conversationId: string): void {
    const currentAgent = this.activeAgent();
    if (!currentAgent) return;

    this.chatService.deleteConversation(currentAgent.id, conversationId).subscribe({
      next: () => {
        this.conversationsList.update((list) => list.filter((c) => c.id !== conversationId));

        if (this.activeConversationId() === conversationId) {
          this.activeConversationId.set(null);
          this.chatService.clearMessages(currentAgent.id);
        }
      },
      error: (err: unknown) => console.error('Error deleting conversation:', err)
    });
  }

  private scrollToBottom(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  focusInput(): void {
    if (this.chatTextareaRef?.nativeElement && !this.isCurrentAgentStreaming()) {
      this.chatTextareaRef.nativeElement.focus();
    }
  }

  onDeleteMessage(messageId: string): void {
    const currentAgent = this.activeAgent();
    const convId = this.activeConversationId();
    if (!currentAgent || !messageId) return;

    // 1. Nachrichten-ID aus dem aktuellen Signal ermitteln
    const currentMsgs = this.chatService.getMessagesSignal(currentAgent.id)();
    const targetMsg = currentMsgs.find(m => m.id === messageId);

    // Falls aus irgendeinem Grund keine ConvId da ist, versuchen wir sie aus der Nachricht zu ziehen
    const effectiveConvId = convId || targetMsg?.conversation_id;

    if (!effectiveConvId) {
      console.warn('Keine Conversation-ID für das Löschen gefunden.');
      return;
    }

    // 2. Optimistisches UI-Update (Nachricht sofort aus dem Template ausblenden)
    this.chatService.setMessages(
      currentAgent.id,
      currentMsgs.filter((m) => m.id !== messageId)
    );

    // 3. Backend-Call durchführen
    this.chatService.deleteMessage(currentAgent.id, effectiveConvId, messageId).subscribe({
      error: (err: unknown) => {
        console.error('Failed to delete message on backend, rolling back:', err);
        // Fallback: Bei Fehler im Backend die Nachricht wieder im UI herstellen
        this.chatService.setMessages(currentAgent.id, currentMsgs);
      }
    });
  }

  onResetConversation(): void {
    const currentAgent = this.activeAgent();
    const convId = this.activeConversationId();
    if (!currentAgent || !convId) return;

    this.chatService.clearConversationMessages(currentAgent.id, convId).subscribe({
      next: () => {
        this.chatService.clearMessages(currentAgent.id);
      },
      error: (err: unknown) => console.error('Failed to reset conversation:', err)
    });
  }

  /**
   * Handles renaming a conversation item.
   *
   * @param event - Object containing target conversation ID and new title.
   */
  onRenameConversation(event: { id: string; newTitle: string }): void {
    const currentAgent = this.activeAgent();
    if (!currentAgent) return;

    this.chatService.updateConversationTitle(currentAgent.id, event.id, event.newTitle).subscribe({
      next: (updated) => {
        this.conversationsList.update((list) =>
          list.map((c) => (c.id === updated.id ? { ...c, title: updated.title } : c))
        );
      },
      error: (err: unknown) => console.error('Failed to rename conversation:', err)
    });
  }
}