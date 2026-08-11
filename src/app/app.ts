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

  private agentService = inject(ApiAgentService);
  agentConfig = viewChild(AgentConfigComponent);
  
  title = 'workspace-app';
  isLightMode = signal<boolean>(false);

  rightPanelWidth = signal<number>(500);
  private isResizing = false;

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
    this.isResizing = false;
  }

  toggleTheme() {
    this.isLightMode.update(mode => !mode);
  }

  

  onCreateNewAgent() {
    this.agentService.clearSelection();
    this.agentConfig()?.resetForm();
  }
}