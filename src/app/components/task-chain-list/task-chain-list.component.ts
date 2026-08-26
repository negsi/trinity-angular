import { Component, input, signal, computed } from '@angular/core';
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

  // State für Einklappen/Ausklappen (Standardmäßig eingeklappt)
  readonly isExpanded = signal<boolean>(false);

  // Shared Helper Functions für Avatare
  readonly getInitials = getInitials;
  readonly getAvatarBg = getAvatarColor;

  /**
   * Berechnet den aktuellen Fortschritt der Task-Chain.
   */
  readonly progressStats = computed(() => {
    const steps = this.phase().steps || [];
    const total = steps.length;
    const completed = steps.filter(s => s.status === 'completed').length;
    const runningStep = steps.find(s => s.status === 'running');
    const isRunning = steps.some(s => s.status === 'running');

    return {
      total,
      completed,
      isRunning,
      currentStepNumber: runningStep?.step_number || (completed < total ? completed + 1 : total)
    };
  });

  toggleExpand(event: MouseEvent): void {
    event.stopPropagation();
    this.isExpanded.update(v => !v);
  }

  /**
   * Safe extraction of target agent name/id from task parameters.
   */
  getAgentName(parameters?: Record<string, unknown> | null): string {
    if (!parameters) return 'Sub-Agent';
    const target = parameters['target_agent_id'] ?? parameters['agent_id'];
    return typeof target === 'string' && target.trim() ? target : 'Sub-Agent';
  }
}