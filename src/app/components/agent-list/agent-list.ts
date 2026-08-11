import { Component, input, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiAgentService } from '../../services/agent.service';
import { Agent } from '../../models/agent.model';

@Component({
  selector: 'app-agent-list',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './agent-list.html',
  styleUrl: './agent-list.scss'
})
export class AgentListComponent implements OnInit {
  // 1. Input Signal
  isLightMode = input.required<boolean>();

  // 2. Collapse State Signal
  isCollapsed = signal<boolean>(false);

  // 3. Public Service Inject
  public agentService = inject(ApiAgentService);

  ngOnInit(): void {
    this.agentService.loadAgents();
  }

  toggleCollapse(): void {
    this.isCollapsed.update(val => !val);
  }

  selectAgent(agent: Agent): void {
    this.agentService.selectAgent(agent);
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
}