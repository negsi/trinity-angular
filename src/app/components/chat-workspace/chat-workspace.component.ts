import {
  Component,
  input,
  signal,
  inject,
  effect,
  computed,
  viewChild,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarkdownModule } from 'ngx-markdown';
import { ApiAgentService } from '../../services/agent.service';
import { ApiChatService } from '../../services/chat.service';
import { SendMessageDto, ChatMessageUI, MessageGroup } from '../../models/message.model';
import { ConversationUI } from '../../models/conversation.model';
import { ConversationDrawerComponent } from '../conversation-drawer/conversation-drawer.component';
import { getInitials, getAvatarColor } from '../../utils/avatar.util';
import { formatDateLabel } from '../../utils/date.util';
import { stripMarkdown } from '../../utils/text.util';

/**
 * Main chat interaction area for conversing with active AI agents.
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
    ConversationDrawerComponent
  ],
  templateUrl: './chat-workspace.component.html',
  styleUrl: './chat-workspace.component.scss'
})
export class ChatWorkspaceComponent {
  /** Mode indicator signal */
  readonly isLightMode = input.required<boolean>();

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

  // Shared Helper Functions for Template
  readonly getInitials = getInitials;
  readonly getAvatarBg = getAvatarColor;

  /**
   * Computed flag checking whether current input text exceeds single line.
   */
  readonly isMultiLine = computed<boolean>(() => {
    const text = this.currentInput();
    return text.includes('\n');
  });

  /**
   * Computed message groups structured with relative date headers.
   */
  readonly messageGroups = computed<MessageGroup[]>(() => {
    const rawMessages = this.chatService.messages();
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
    // Automatically load conversations when selected agent changes
    effect(() => {
      const selected = this.agentService.selectedAgent();
      if (!selected) return;

      this.chatService.getConversations(selected.id).subscribe({
        next: (convs: ConversationUI[]) => {
          this.conversationsList.set(convs);

          if (convs && convs.length > 0) {
            const latestConv = convs[0];
            this.activeConversationId.set(latestConv.id);
            this.chatService.loadMessages(selected.id, latestConv.id);
          } else {
            this.activeConversationId.set(null);
            this.chatService.clearMessages();
          }
        },
        error: (err: unknown) => {
          console.error('Error loading conversations:', err);
          this.activeConversationId.set(null);
          this.chatService.clearMessages();
        }
      });
    });

    // Auto-scroll when messages update
    effect(() => {
      this.messageGroups();
      setTimeout(() => this.scrollToBottom(), 0);
    });
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
    const activeAgent = this.agentService.selectedAgent();
    if (!activeAgent) return;

    this.chatService.getConversations(activeAgent.id).subscribe({
      next: (convs: ConversationUI[]) => this.conversationsList.set(convs),
      error: (err: unknown) => console.error('Failed to load conversations:', err)
    });
  }

  onSelectConversation(conversationId: string): void {
    const activeAgent = this.agentService.selectedAgent();
    if (!activeAgent) return;

    this.activeConversationId.set(conversationId);
    this.chatService.loadMessages(activeAgent.id, conversationId);
    this.isDrawerOpen.set(false);
  }

  onNewConversation(): void {
    this.activeConversationId.set(null);
    this.chatService.clearMessages();
    this.isDrawerOpen.set(false);

    setTimeout(() => {
      this.chatTextarea()?.nativeElement.focus();
    }, 0);
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const newFiles = Array.from(input.files);
      this.selectedFiles.update((prev) => [...prev, ...newFiles]);
      input.value = '';
    }
  }

  removeFile(index: number): void {
    this.selectedFiles.update((prev) => prev.filter((_, i) => i !== index));
  }

  toggleExpand(): void {
    this.isExpanded.update((v) => !v);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
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
    const text = this.currentInput().trim();
    const files = this.selectedFiles();
    const activeAgent = this.agentService.selectedAgent();

    if ((!text && files.length === 0) || !activeAgent) return;

    const payload: SendMessageDto = {
      conversation_id: this.activeConversationId() ?? undefined,
      sender_id: 'user-christian',
      sender_type: 'user',
      sender_name: 'Christian',
      text: text,
      recipient_id: activeAgent.id
    };

    this.currentInput.set('');
    this.selectedFiles.set([]);
    this.isExpanded.set(false);

    const textareaEl = this.chatTextarea()?.nativeElement;
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }

    this.chatService.sendMessage(payload, activeAgent.name, files, (newConvId: string) => {
      this.activeConversationId.set(newConvId);
      this.loadConversations();
    });
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
    const activeAgent = this.agentService.selectedAgent();
    if (!activeAgent || !msgText) return;

    const payload: SendMessageDto = {
      conversation_id: this.activeConversationId() ?? undefined,
      sender_id: 'user-christian',
      sender_type: 'user',
      sender_name: 'Christian',
      text: msgText,
      recipient_id: activeAgent.id
    };

    this.chatService.sendMessage(payload, activeAgent.name, []);
  }

  onDeleteConversation(conversationId: string): void {
    const activeAgent = this.agentService.selectedAgent();
    if (!activeAgent) return;

    this.chatService.deleteConversation(activeAgent.id, conversationId).subscribe({
      next: () => {
        this.conversationsList.update((list) => list.filter((c) => c.id !== conversationId));

        if (this.activeConversationId() === conversationId) {
          this.activeConversationId.set(null);
          this.chatService.clearMessages();
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
}
