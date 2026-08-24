import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TaskPhase } from '../../models/message.model';

@Component({
  selector: 'app-task-chain-list',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './task-chain-list.component.html',
  styleUrl: './task-chain-list.component.scss'
})
export class TaskChainListComponent {
  readonly phase = input.required<TaskPhase>();
}