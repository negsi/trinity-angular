import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface SidebarItem {
  id: string;
  icon: string;
  label: string;
}

@Component({
  selector: 'app-right-sidebar',
  standalone: true,
  imports: [
    CommonModule, 
    MatButtonModule, 
    MatIconModule, 
    MatDividerModule, 
    MatTooltipModule
  ],
  templateUrl: './right-sidebar.component.html',
  styleUrl: './right-sidebar.component.scss'
})
export class RightSidebarComponent {
  readonly isLightMode = input.required<boolean>();
  readonly isCollapsed = input.required<boolean>();
  readonly activeTab = input.required<string>();

  /** Dynamische Liste der Menüpunkte */
  readonly navItems: SidebarItem[] = [
    { id: 'config', icon: 'tune', label: 'Agent Config' },
    { id: 'workspace', icon: 'folder', label: 'Arbeitsverzeichnis' },
  ];

  /** Output Events */
  readonly toggleCollapse = output<void>();
  readonly activeTabChange = output<string>();

  onToggle(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.toggleCollapse.emit();
  }

  selectTab(tabId: string, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }

    if (this.isCollapsed()) {
      this.toggleCollapse.emit();
    }

    this.activeTabChange.emit(tabId);
  }
}