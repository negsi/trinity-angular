import { Component, signal, HostListener, viewChild, inject } from '@angular/core';
import { SidebarComponent } from './components/sidebar/sidebar';
import { AgentListComponent } from './components/agent-list/agent-list';
import { ChatWorkspaceComponent } from './components/chat-workspace/chat-workspace';
import { AgentConfigComponent } from './components/agent-config/agent-config';
import { ApiAgentService } from './services/agent.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    SidebarComponent, 
    AgentListComponent, 
    ChatWorkspaceComponent, 
    AgentConfigComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent {
  private readonly PANEL_WIDTH_KEY = 'trinity_right_panel_width';

  private agentService = inject(ApiAgentService);
  agentConfig = viewChild(AgentConfigComponent);
  
  title = 'workspace-app';
  isLightMode = signal<boolean>(false);

  // Initialer Wert aus localStorage (Fallback: 500px)
  rightPanelWidth = signal<number>(this.getInitialPanelWidth());
  private isResizing = false;

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

  startResizing(event: MouseEvent) {
    this.isResizing = true;
    event.preventDefault();
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isResizing) return;

    const newWidth = window.innerWidth - event.clientX;
    if (newWidth >= 350 && newWidth <= 800) {
      this.rightPanelWidth.set(newWidth);
    }
  }

  @HostListener('window:mouseup')
  onMouseUp() {
    if (this.isResizing) {
      this.isResizing = false;
      // Breite nach dem Ziehen im localStorage speichern
      localStorage.setItem(this.PANEL_WIDTH_KEY, this.rightPanelWidth().toString());
    }
  }

  toggleTheme() {
    this.isLightMode.update(mode => !mode);
  }

  onCreateNewAgent() {
    this.agentService.clearSelection();
    this.agentConfig()?.resetForm();
  }
}