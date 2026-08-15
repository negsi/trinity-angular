import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConversationUI } from '../../models/conversation.model';
import { formatDateTime } from '../../utils/date.util';

/**
 * Slide-out drawer displaying an agent's past conversations.
 */
@Component({
  selector: 'app-conversation-drawer',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './conversation-drawer.component.html',
  styleUrl: './conversation-drawer.component.scss'
})
export class ConversationDrawerComponent {
  /** Whether the drawer overlay is visible */
  readonly isOpen = input<boolean>(false);

  /** Conversation records list */
  readonly conversations = input<ConversationUI[]>([]);

  /** ID of the currently selected conversation */
  readonly activeConversationId = input<string | null>(null);

  /** Emits when the drawer close button or overlay is clicked */
  readonly close = output<void>();

  /** Emits when a conversation item is selected */
  readonly selectConversation = output<string>();

  /** Emits when deleting a conversation */
  readonly deleteConversation = output<string>();

  /** Readonly date helper reference */
  readonly formatDate = formatDateTime;

  /**
   * Handles selecting a conversation.
   *
   * @param id - Conversation identifier.
   */
  onSelect(id: string): void {
    this.selectConversation.emit(id);
  }

  /**
   * Handles deleting a conversation.
   *
   * @param event - Mouse event for stopping propagation.
   * @param id - Conversation identifier.
   */
  onDelete(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.deleteConversation.emit(id);
  }
}
