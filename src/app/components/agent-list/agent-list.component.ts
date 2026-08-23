import { Component, input, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiAgentService } from '../../services/agent.service';
import { Agent } from '../../models/agent.model';
import { getInitials, getAvatarColor } from '../../utils/avatar.util';

@Component({
  selector: 'app-agent-list',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './agent-list.component.html',
  styleUrl: './agent-list.component.scss'
})
export class AgentListComponent implements OnInit {
  private readonly COLLAPSE_KEY = 'trinity_agent_list_collapsed';

  readonly isLightMode = input.required<boolean>();
  readonly isCollapsed = signal<boolean>(this.getInitialCollapseState());

  readonly agentService = inject(ApiAgentService);

  readonly getInitials = getInitials;
  readonly getAvatarBg = getAvatarColor;

  ngOnInit(): void {
    this.agentService.loadAgents();
  }

  private getInitialCollapseState(): boolean {
    return localStorage.getItem(this.COLLAPSE_KEY) === 'true';
  }

  toggleCollapse(): void {
    this.isCollapsed.update((val) => {
      const nextState = !val;
      localStorage.setItem(this.COLLAPSE_KEY, String(nextState));
      return nextState;
    });
  }

  selectAgent(agent: Agent): void {
    this.agentService.selectAgent(agent);
  }
}