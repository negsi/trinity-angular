import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TaskPhase } from '../../models/task-chain.model';
import { getInitials, getAvatarColor } from '../../utils/avatar.util';

@Component({
  selector: 'app-task-chain-list',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './task-chain-list.component.html',
  styleUrl: './task-chain-list.component.scss'
})
export class TaskChainListComponent {
  readonly phase = input.required<TaskPhase>();

  // Shared Helper Functions für Avatare
  readonly getInitials = getInitials;
  readonly getAvatarBg = getAvatarColor;

  /**
   * Safe extraction of target agent name/id from task parameters.
   */
  getAgentName(parameters?: Record<string, unknown> | null): string {
    if (!parameters) return 'Sub-Agent';
    const target = parameters['target_agent_id'] ?? parameters['agent_id'];
    return typeof target === 'string' && target.trim() ? target : 'Sub-Agent';
  }
}