import { Component, input, inject, OnInit, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiAgentService } from '../../services/agent.service';
import { Agent } from '../../models/agent.model';
import { getInitials, getAvatarColor } from '../../utils/avatar.util';

export type AgentViewMode = 'single' | 'multi';

@Component({
  selector: 'app-agent-list',
  standalone: true,
  imports: [
    CommonModule, 
    MatIconModule, 
    MatButtonModule, 
    MatTooltipModule
  ],
  templateUrl: './agent-list.component.html',
  styleUrl: './agent-list.component.scss'
})
export class AgentListComponent implements OnInit {
  private readonly COLLAPSE_KEY = 'trinity_agent_list_collapsed';
  private readonly VIEW_MODE_KEY = 'trinity_agent_view_mode';

  readonly isLightMode = input.required<boolean>();
  readonly isCollapsed = signal<boolean>(this.getInitialCollapseState());
  
  // View-Mode Signal ('solo' vs 'crew')
  readonly viewMode = signal<AgentViewMode>(this.getInitialViewMode());
  readonly viewModeChange = output<AgentViewMode>();

  readonly agentService = inject(ApiAgentService);

  readonly getInitials = getInitials;
  readonly getAvatarBg = getAvatarColor;

  ngOnInit(): void {
    this.agentService.loadAgents();
  }

  private getInitialCollapseState(): boolean {
    return localStorage.getItem(this.COLLAPSE_KEY) === 'true';
  }

  private getInitialViewMode(): AgentViewMode {
    const saved = localStorage.getItem(this.VIEW_MODE_KEY);
    if (saved === 'single' || saved === 'multi') {
      return saved;
    }
    return 'single';
  }

  toggleCollapse(): void {
    this.isCollapsed.update((val) => {
      const nextState = !val;
      localStorage.setItem(this.COLLAPSE_KEY, String(nextState));
      return nextState;
    });
  }

  setViewMode(mode: AgentViewMode): void {
    this.viewMode.set(mode);
    localStorage.setItem(this.VIEW_MODE_KEY, mode);
    this.viewModeChange.emit(mode);

    if (mode === 'multi' && this.agentService.selectedCrewAgents().length === 0) {
      const current = this.agentService.selectedAgent();
      if (current) {
        this.agentService.toggleCrewAgent(current);
      }
    }
  }

  onAgentClick(agent: Agent): void {
    if (this.viewMode() === 'single') {
      this.agentService.selectAgent(agent);
    } else {
      this.agentService.toggleCrewAgent(agent);
    }
  }

  isCrewSelected(agentId: string): boolean {
    return this.agentService.selectedCrewAgents().some((a) => a.id === agentId);
  }
}