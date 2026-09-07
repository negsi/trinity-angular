import { Component, input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApiAgentService } from '../../services/agent.service';
import { ChatWorkspaceComponent } from '../chat-workspace/chat-workspace.component';

@Component({
  selector: 'app-crew-workspace',
  standalone: true,
  imports: [CommonModule, ChatWorkspaceComponent, MatIconModule],
  templateUrl: './crew-workspace.component.html',
  styleUrl: './crew-workspace.component.scss'
})
export class CrewWorkspaceComponent {
  readonly isLightMode = input.required<boolean>();
  private readonly agentService = inject(ApiAgentService);

  readonly crewAgents = this.agentService.selectedCrewAgents;
}