import { Component, ElementRef, ViewChild, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule],
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

  /** Emits when renaming a conversation */
  readonly renameConversation = output<{ id: string; newTitle: string }>();

  /** ID of the conversation currently being edited */
  readonly editingId = signal<string | null>(null);

  /** Title string value during editing */
  readonly editingTitle = signal<string>('');

  /** Reference to input element for auto-focus/select */
  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;

  /** Readonly date helper reference */
  readonly formatDate = formatDateTime;

  /**
   * Handles selecting a conversation.
   *
   * @param id - Conversation identifier.
   */
  onSelect(id: string): void {
    if (this.editingId() === id) return;
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

  /**
   * Starts inline editing of a conversation title.
   *
   * @param event - Mouse event for stopping propagation.
   * @param conv - Target conversation object.
   */
  startRename(event: MouseEvent, conv: ConversationUI): void {
    event.stopPropagation();
    this.editingId.set(conv.id);
    this.editingTitle.set(conv.title || 'Unbenannte Konversation');

    setTimeout(() => {
      if (this.titleInput) {
        this.titleInput.nativeElement.focus();
        this.titleInput.nativeElement.select();
      }
    }, 0);
  }

  /**
   * Saves the edited title and exits edit mode.
   *
   * @param id - Conversation identifier.
   */
  saveRename(id: string): void {
    const trimmed = this.editingTitle().trim();
    if (trimmed && this.editingId() === id) {
      this.renameConversation.emit({ id, newTitle: trimmed });
    }
    this.cancelRename();
  }

  /**
   * Cancels editing mode without saving changes.
   */
  cancelRename(): void {
    this.editingId.set(null);
    this.editingTitle.set('');
  }
}