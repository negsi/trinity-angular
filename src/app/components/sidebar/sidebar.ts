// sidebar.ts
import { Component, input, output, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiAgentService } from '../../services/agent.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatDividerModule, MatTooltipModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class SidebarComponent {
  isLightMode = input.required<boolean>();
  themeToggle = output<void>();

  agentService = inject(ApiAgentService);
  
  // 1. Neues Event zum Erstellen eines neuen Agenten
  createNewAgent = output<void>();

  onToggleTheme() {
    this.themeToggle.emit();
  }

  // 2. Klick-Handler für den Compose-Button
  onCompose() {
    this.createNewAgent.emit();
    this.agentService.startCreating();
  }
}