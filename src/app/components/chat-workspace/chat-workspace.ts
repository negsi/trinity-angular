import { Component, input, signal, inject, effect, computed, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiAgentService } from '../../services/agent.service';
import { ApiChatService } from '../../services/chat.service';
import { SendMessageDto, MessageAttachment } from '../../models/message.model';
import { MarkdownModule } from 'ngx-markdown';

export interface ChatMessageUI {
  id: string;
  sender: 'other' | 'me';
  senderName: string;
  avatarBg: string;
  avatarInitials: string;
  text: string;
  time: string;
  isRead?: boolean;
  attachments?: MessageAttachment[];
}

export interface MessageGroup {
  dateLabel: string;
  messages: ChatMessageUI[];
}

@Component({
  selector: 'app-chat-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MarkdownModule],
  templateUrl: './chat-workspace.html',
  styleUrl: './chat-workspace.scss'
})
export class ChatWorkspaceComponent {
  isLightMode = input.required<boolean>();

  agentService = inject(ApiAgentService);
  chatService = inject(ApiChatService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('chatTextarea') private chatTextarea?: ElementRef<HTMLTextAreaElement>;

  currentInput = signal<string>('');
  selectedFiles = signal<File[]>([]);
  isExpanded = signal<boolean>(false); // Modus für großes Eingabefeld

  constructor() {
    effect(() => {
      const selected = this.agentService.selectedAgent();
      if (selected) {
        this.chatService.loadMessages(selected.id);
      }
    });

    effect(() => {
      this.messageGroups();
      this.cdr.detectChanges();
      setTimeout(() => this.scrollToBottom(), 0);
    });
  }

  messageGroups = computed<MessageGroup[]>(() => {
    const rawMessages = this.chatService.messages();
    if (!rawMessages || rawMessages.length === 0) return [];

    const groupsMap = new Map<string, ChatMessageUI[]>();

    for (const msg of rawMessages) {
      const dateObj = new Date(msg.timestamp);
      const dateLabel = this.formatDateLabel(dateObj);

      const uiMsg: ChatMessageUI = {
        id: msg.id,
        sender: msg.sender_type === 'user' ? 'me' : 'other',
        senderName: msg.sender_name,
        avatarBg: this.getAvatarBg(msg.sender_name),
        avatarInitials: this.getInitials(msg.sender_name),
        text: msg.text,
        time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: true,
        attachments: msg.attachments || []
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

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const newFiles = Array.from(input.files);
      this.selectedFiles.update(prev => [...prev, ...newFiles]);
      input.value = '';
    }
  }

  removeFile(index: number): void {
    this.selectedFiles.update(prev => prev.filter((_, i) => i !== index));
  }

  toggleExpand(): void {
    this.isExpanded.update(v => !v);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Verhindert Zeilenumbruch bei Enter
      this.sendMessage();
    }
  }

  adjustTextareaHeight(): void {
    if (this.chatTextarea?.nativeElement) {
      const el = this.chatTextarea.nativeElement;
      
      // Höhe kurz zurücksetzen, um die echte scrollHeight zu messen
      el.style.height = 'auto';

      const singleLineHeight = 24; // Einzeilige Höhe des Textes
      if (el.scrollHeight > singleLineHeight + 4) { // Mehrzeilig erkannt
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      } else {
        el.style.height = ''; // Zurück auf CSS-Standard
      }
    }
  }

  // Hilfs-Getter für Template: Ist Text vorhanden, der über eine Zeile geht?
  get isMultiLine(): boolean {
    const text = this.currentInput();
    if (!text) return false;
    return text.includes('\n') || (this.chatTextarea?.nativeElement ? this.chatTextarea.nativeElement.scrollHeight > 28 : false);
  }

  sendMessage(): void {
    const text = this.currentInput().trim();
    const files = this.selectedFiles();
    const activeAgent = this.agentService.selectedAgent();

    if ((!text && files.length === 0) || !activeAgent) return;

    const payload: SendMessageDto = {
      conversation_id: activeAgent.id,
      sender_id: 'user-christian',
      sender_type: 'user',
      sender_name: 'Christian',
      text: text,
      recipient_id: activeAgent.id
    };

    this.currentInput.set('');
    this.selectedFiles.set([]);
    this.isExpanded.set(false); // Nach Senden ggf. wieder einklappen

    if (this.chatTextarea?.nativeElement) {
      this.chatTextarea.nativeElement.style.height = 'auto';
    }

    this.chatService.sendMessage(payload, activeAgent.name, files);
  }

  getInitials(name: string): string {
    if (!name) return 'AG';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  getAvatarBg(name: string): string {
    const initials = this.getInitials(name);
    let hash = 0;
    for (let i = 0; i < initials.length; i++) {
      hash = initials.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 75%, 42%)`;
  }

  private scrollToBottom(): void {
    if (this.scrollContainer?.nativeElement) {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  private formatDateLabel(date: Date): string {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'TODAY';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'YESTERDAY';
    } else {
      return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
}