import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-right-sidebar',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatDividerModule, MatTooltipModule],
  templateUrl: './right-sidebar.component.html',
  styleUrl: './right-sidebar.component.scss'
})
export class RightSidebarComponent {
  readonly isLightMode = input.required<boolean>();
  readonly isCollapsed = input.required<boolean>();

  /** Output Event zum Toggeln */
  readonly toggleCollapse = output<void>();

  onToggle(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.toggleCollapse.emit();
  }
}