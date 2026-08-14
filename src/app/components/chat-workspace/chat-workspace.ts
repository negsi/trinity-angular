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
import { ConversationDrawer, ConversationUI } from '../conversation-drawer/conversation-drawer';

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
  imports: [
    CommonModule, 
    FormsModule, 
    MatIconModule, 
    MatButtonModule, 
    MatTooltipModule, 
    MarkdownModule,
    ConversationDrawer
  ],
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

  // --- Drawer & Conversations Signals ---
  isDrawerOpen = signal<boolean>(false);
  conversationsList = signal<ConversationUI[]>([]);
  activeConversationId = signal<string | null>(null);

  // Signal für den Vollbild-Zustand des Chat-Workspaces
  isFullscreen = signal<boolean>(false);

  constructor() {
    effect(() => {
      const selected = this.agentService.selectedAgent();
      if (!selected) return;

      this.chatService.getConversations(selected.id).subscribe({
        next: (convs) => {
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
        error: (err) => {
          console.error('Fehler beim Laden der Konversationen des Agenten:', err);
          this.activeConversationId.set(null);
          this.chatService.clearMessages();
        }
      });
    });

    effect(() => {
      this.messageGroups();
      this.cdr.detectChanges();
      setTimeout(() => this.scrollToBottom(), 0);
    });
  }

  toggleFullscreen(): void {
    this.isFullscreen.update(v => !v);
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

    // Beispielhafter Call an den Service/Backend
    // Passe den Aufruf an dein ApiChatService / ApiAgentService an, falls nötig
    this.chatService.getConversations(activeAgent.id).subscribe({
      next: (convs) => {
        this.conversationsList.set(convs);
      },
      error: (err) => {
        console.error('Fehler beim Laden der Konversationen:', err);
      }
    });
  }

  onSelectConversation(conversationId: string): void {
    const activeAgent = this.agentService.selectedAgent();
    if (!activeAgent) return;

    this.activeConversationId.set(conversationId);
    this.chatService.loadMessages(activeAgent.id, conversationId);

    this.isDrawerOpen.set(false);
  }

  startNewConversation(): void {
    const activeAgent = this.agentService.selectedAgent();
    if (!activeAgent) return;

    // Setzt die aktive Konversations-ID zurück/neu und leert die Nachrichten
    this.activeConversationId.set(activeAgent.id);
    this.chatService.clearMessages();
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

  private createMessagePayload(activeAgentId: string, text: string): SendMessageDto {
    return {
      conversation_id: this.activeConversationId() ?? undefined,
      sender_id: 'user-christian',
      sender_type: 'user',
      sender_name: 'Christian',
      text: text,
      recipient_id: activeAgentId
    };
  }

  sendMessage(): void {
    const text = this.currentInput().trim();
    const files = this.selectedFiles();
    const activeAgent = this.agentService.selectedAgent();

    if ((!text && files.length === 0) || !activeAgent) return;

    const payload = this.createMessagePayload(activeAgent.id, text);

    this.currentInput.set('');
    this.selectedFiles.set([]);
    this.isExpanded.set(false);

    if (this.chatTextarea?.nativeElement) {
      this.chatTextarea.nativeElement.style.height = 'auto';
    }

    // Callback setzt nach dem ersten Senden die neu erzeugte conversation_id
    this.chatService.sendMessage(payload, activeAgent.name, files, (newConvId) => {
      this.activeConversationId.set(newConvId);
      this.loadConversations(); // Liste direkt neu laden!
    });
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

  // Entfernt Markdown-Syntax für "Copy as Text"
  copyAsPlainText(markdownText: string): void {
    if (!markdownText) return;

    const plainText = markdownText
      // 1. Codeblöcke & Inline-Code auflösen
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''))
      .replace(/`([^`]+)`/g, '$1')
      // 2. Links [Text](Url) -> Text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      // 3. Globale Formatierungszeichen (*, **, _, __, ~~) vorab säubern
      .replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, '$2')
      .replace(/(\*\*|__|\*|_|~~)/g, '') // Sicherheitsnetz für verwaiste Sterne/Underscores
      // 4. Zeile für Zeile säubern (Listen, Indents, Headers)
      .split('\n')
      .map(line => {
        return line
          // Führende Whitespaces, Tabs, Unicodes und Listen-Marker (*, -, +, 1.) entfernen
          .replace(/^[\s\u00A0]*([\*\-\+]|\d+\.)[\s\u00A0]*/, '')
          // Blockquotes (>) entfernen
          .replace(/^[\s\u00A0]*>[\s\u00A0]*/, '')
          // Überschriften (#) entfernen
          .replace(/^#{1,6}\s+/, '')
          .trim();
      })
      // Leerzeilen-Wildwuchs auffangen
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    navigator.clipboard.writeText(plainText);
  }

  // Kopiert den rohen Text inklusive Markdown
  copyAsMarkdown(markdownText: string): void {
    if (!markdownText) return;
    navigator.clipboard.writeText(markdownText);
  }

  resendMessage(msgText: string): void {
    const activeAgent = this.agentService.selectedAgent();
    if (!activeAgent || !msgText) return;

    const payload = this.createMessagePayload(activeAgent.id, msgText);
    this.chatService.sendMessage(payload, activeAgent.name, []);
  }

  // chat-workspace.component.ts

  // chat-workspace.component.ts

  onDeleteConversation(conversationId: string): void {
    const activeAgent = this.agentService.selectedAgent();
    if (!activeAgent) return;

    // Hier BEIDE IDs übergeben: activeAgent.id UND conversationId
    this.chatService.deleteConversation(activeAgent.id, conversationId).subscribe({
      next: () => {
        // 1. Liste im UI aktualisieren
        this.conversationsList.update(list => list.filter(c => c.id !== conversationId));

        // 2. Falls die gelöschte Konversation gerade geladen war -> Workspace leeren
        if (this.activeConversationId() === conversationId) {
          this.activeConversationId.set(null);
          this.chatService.clearMessages();
        }
      },
      error: (err) => console.error('Fehler beim Löschen der Konversation:', err)
    });
  }

  onNewConversation(): void {
    this.activeConversationId.set(null);
    this.chatService.clearMessages();
    this.isDrawerOpen.set(false);

    setTimeout(() => {
      this.chatTextarea?.nativeElement?.focus();
    }, 0);
  }
}