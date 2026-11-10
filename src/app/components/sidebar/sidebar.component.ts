import { Component, input, output, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiAgentService } from '../../services/agent.service';

export type MainWorkspaceTab = 'chat' | 'workflows';

/**
 * Main application navigation sidebar.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatDividerModule, MatTooltipModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent implements OnInit {
  private readonly THEME_KEY = 'trinity_theme_mode';
  private readonly agentService = inject(ApiAgentService);

  /** Whether the application is running in light mode */
  readonly isLightMode = input.required<boolean>();

  /** Currently active main workspace tab ('chat' | 'workflows') */
  readonly activeMainTab = input<MainWorkspaceTab>('chat');

  /** Event emitted when switching between Chat and Workflows */
  readonly mainTabChange = output<MainWorkspaceTab>();

  /** Event emitted when the theme toggle is pressed */
  readonly themeToggle = output<void>();

  /** Event emitted when requesting agent creation */
  readonly createNewAgent = output<void>();

  ngOnInit(): void {
    const savedTheme = localStorage.getItem(this.THEME_KEY);
    if (savedTheme !== null) {
      const isSavedLight = savedTheme === 'light';
      if (isSavedLight !== this.isLightMode()) {
        this.themeToggle.emit();
      }
    }
  }

  /**
   * Switches the active main workspace view ('chat' or 'workflows').
   */
  selectMainTab(tab: MainWorkspaceTab): void {
    this.mainTabChange.emit(tab);
  }

  /**
   * Toggles the UI color theme and persists the user preference.
   */
  onToggleTheme(): void {
    const nextState = !this.isLightMode();
    localStorage.setItem(this.THEME_KEY, nextState ? 'light' : 'dark');
    this.themeToggle.emit();
  }

  /**
   * Handles initiating creation of a new agent.
   */
  onCompose(): void {
    this.createNewAgent.emit();
    this.agentService.startCreating();
  }
}