import { Component, signal, HostListener, viewChild, inject, effect } from '@angular/core';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { AgentListComponent } from './components/agent-list/agent-list.component';
import { ChatWorkspaceComponent } from './components/chat-workspace/chat-workspace.component';
import { AgentConfigComponent } from './components/agent-config/agent-config.component';
import { RightSidebarComponent } from './components/right-sidebar/right-sidebar.component';
import { ApiAgentService } from './services/agent.service';

/**
 * Root Application Component providing the primary 3-column workspace layout.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    SidebarComponent,
    AgentListComponent,
    ChatWorkspaceComponent,
    AgentConfigComponent,
    RightSidebarComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly PANEL_WIDTH_KEY = 'trinity_right_panel_width';
  private readonly PANEL_COLLAPSED_KEY = 'trinity_right_panel_collapsed';
  private readonly agentService = inject(ApiAgentService);

  readonly agentConfig = viewChild(AgentConfigComponent);

  /** Light mode toggle state signal */
  readonly isLightMode = signal<boolean>(false);

  /** Right-hand configuration panel collapsed state signal */
  readonly isRightPanelCollapsed = signal<boolean>(this.getInitialCollapsedState());

  /** Right-hand configuration panel width in pixels */
  readonly rightPanelWidth = signal<number>(this.getInitialPanelWidth());

  private isResizing = false;

  constructor() {
    // Reagiert automatisch auf jede Änderung von isRightPanelCollapsed
    effect(() => {
      localStorage.setItem(this.PANEL_COLLAPSED_KEY, String(this.isRightPanelCollapsed()));
    });
  }

  private getInitialCollapsedState(): boolean {
    return localStorage.getItem(this.PANEL_COLLAPSED_KEY) === 'true';
  }

  private getInitialPanelWidth(): number {
    const savedWidth = localStorage.getItem(this.PANEL_WIDTH_KEY);
    if (savedWidth !== null) {
      const parsed = parseInt(savedWidth, 10);
      if (!isNaN(parsed) && parsed >= 350 && parsed <= 800) {
        return parsed;
      }
    }
    return 500;
  }

  /**
   * Toggles the collapsed state of the right-hand panel.
   */
  toggleRightPanel(): void {
    this.isRightPanelCollapsed.update((collapsed) => !collapsed);
  }

  /**
   * Begins the resize dragging session for the right-hand panel.
   */
  startResizing(event: MouseEvent): void {
    this.isResizing = true;
    event.preventDefault();
  }

  /**
   * Tracks mouse movements during resizing.
   */
  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isResizing) return;

    const RIGHT_SIDEBAR_WIDTH = 64;
    const newWidth = window.innerWidth - event.clientX - RIGHT_SIDEBAR_WIDTH;

    if (newWidth >= 350 && newWidth <= 800) {
      this.rightPanelWidth.set(newWidth);
    }
  }

  /**
   * Completes the resizing session and persists the panel width.
   */
  @HostListener('window:mouseup')
  onMouseUp(): void {
    if (this.isResizing) {
      this.isResizing = false;
      localStorage.setItem(this.PANEL_WIDTH_KEY, this.rightPanelWidth().toString());
    }
  }

  /**
   * Toggles the global light/dark theme.
   */
  toggleTheme(): void {
    this.isLightMode.update((mode) => !mode);
  }

  /**
   * Clears selection and focuses the form for creating a new agent.
   */
  onCreateNewAgent(): void {
    this.agentService.clearSelection();
    this.agentConfig()?.resetForm();
  }
}