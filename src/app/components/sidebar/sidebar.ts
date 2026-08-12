import { Component, input, output, inject, OnInit } from '@angular/core';
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
export class SidebarComponent implements OnInit {
  private readonly THEME_KEY = 'trinity_theme_mode';

  isLightMode = input.required<boolean>();
  themeToggle = output<void>();

  agentService = inject(ApiAgentService);
  
  // 1. Neues Event zum Erstellen eines neuen Agenten
  createNewAgent = output<void>();

  ngOnInit(): void {
    const savedTheme = localStorage.getItem(this.THEME_KEY);
    
    // Falls ein Wert im Storage liegt, der vom aktuellen App-State abweicht,
    // triggern wir initial einmal das Toggle-Event zum Synchronisieren.
    if (savedTheme !== null) {
      const isSavedLight = savedTheme === 'light';
      if (isSavedLight !== this.isLightMode()) {
        this.themeToggle.emit();
      }
    }
  }

  onToggleTheme(): void {
    const nextState = !this.isLightMode();
    localStorage.setItem(this.THEME_KEY, nextState ? 'light' : 'dark');
    this.themeToggle.emit();
  }

  // 2. Klick-Handler für den Compose-Button
  onCompose(): void {
    this.createNewAgent.emit();
    this.agentService.startCreating();
  }
}