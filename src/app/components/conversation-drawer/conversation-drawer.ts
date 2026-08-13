import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface ConversationUI {
  id: string;
  agent_id: string;
  title: string;
  created_at: string;
}

@Component({
  selector: 'app-conversation-drawer',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './conversation-drawer.html',
  styleUrl: './conversation-drawer.scss'
})
export class ConversationDrawer {
  isOpen = input<boolean>(false);
  conversations = input<ConversationUI[]>([]);
  activeConversationId = input<string | null>(null);

  close = output<void>();
  selectConversation = output<string>();
  deleteConversation = output<string>();

  onSelect(id: string): void {
    this.selectConversation.emit(id);
  }

  onDelete(event: Event, id: string): void {
    event.stopPropagation();
    this.deleteConversation.emit(id);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}