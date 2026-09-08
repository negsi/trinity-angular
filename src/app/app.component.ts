import { Component, signal, HostListener, viewChild, inject, effect } from '@angular/core';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { AgentListComponent, AgentViewMode } from './components/agent-list/agent-list.component';
import { ChatWorkspaceComponent } from './components/chat-workspace/chat-workspace.component';
import { AgentConfigComponent } from './components/agent-config/agent-config.component';
import { FileWorkspaceComponent } from './components/file-workspace/file-workspace.component';
import { RightSidebarComponent } from './components/right-sidebar/right-sidebar.component';
import { ApiAgentService } from './services/agent.service';

/**
 * Root Application Component providing the primary 3-column / multi-agent workspace layout.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    SidebarComponent,
    AgentListComponent,
    ChatWorkspaceComponent,
    AgentConfigComponent,
    FileWorkspaceComponent,
    RightSidebarComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly PANEL_WIDTH_KEY = 'trinity_right_panel_width';
  private readonly PANEL_COLLAPSED_KEY = 'trinity_right_panel_collapsed';
  private readonly VIEW_MODE_KEY = 'trinity_agent_view_mode';
  private readonly RIGHT_TAB_KEY = 'trinity_active_right_tab';

  readonly agentService = inject(ApiAgentService);
  readonly agentConfig = viewChild(AgentConfigComponent);

  /** Light mode toggle state signal */
  readonly isLightMode = signal<boolean>(false);

  /** Active View Mode ('solo' vs 'crew') */
  readonly viewMode = signal<AgentViewMode>(this.getInitialViewMode());

  /** Right-hand configuration panel collapsed state signal */
  readonly isRightPanelCollapsed = signal<boolean>(this.getInitialCollapsedState());

  /** Right-hand configuration panel width in pixels */
  readonly rightPanelWidth = signal<number>(this.getInitialPanelWidth());

  /** Active Right Tab State ('config' | 'files') */
  readonly activeRightTab = signal<string>(this.getInitialActiveTab());

  private isResizing = false;

  constructor() {
    effect(() => {
      localStorage.setItem(this.PANEL_COLLAPSED_KEY, String(this.isRightPanelCollapsed()));
    });

    effect(() => {
      localStorage.setItem(this.RIGHT_TAB_KEY, this.activeRightTab());
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

  private getInitialViewMode(): AgentViewMode {
    const saved = localStorage.getItem(this.VIEW_MODE_KEY);
    return saved === 'multi' ? 'multi' : 'single';
  }

  private getInitialActiveTab(): string {
    const saved = localStorage.getItem(this.RIGHT_TAB_KEY);
    return saved || 'config';
  }

  /**
   * Handles switching between 'solo' and 'crew' mode.
   */
  onViewModeChange(mode: AgentViewMode): void {
    this.viewMode.set(mode);
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