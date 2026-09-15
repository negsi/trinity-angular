import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Group } from '../../models/group.model';
import { Agent } from '../../models/agent.model';

export interface GroupDialogResult {
  groups: Group[];
  agents: Agent[];
}

@Component({
  selector: 'app-group-management-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatCheckboxModule
  ],
  templateUrl: './group-management-dialog.component.html',
  styleUrl: './group-management-dialog.component.scss'
})
export class GroupManagementDialogComponent {
  readonly dialogRef = inject(MatDialogRef<GroupManagementDialogComponent>);
  readonly data = inject<{ groups: Group[]; agents: Agent[] }>(MAT_DIALOG_DATA);

  readonly groups = signal<Group[]>(structuredClone(this.data.groups));
  readonly agents = signal<Agent[]>(structuredClone(this.data.agents));
  newGroupName = '';

  /**
   * Add a new group locally
   */
  addGroup(): void {
    if (!this.newGroupName.trim()) return;
    const newGroup: Group = {
      id: Date.now().toString(),
      name: this.newGroupName.trim(),
      agent_count: 0
    };
    this.groups.update((list) => [...list, newGroup]);
    this.newGroupName = '';
  }

  /**
   * Remove a group by its ID and unlink it from assigned agents
   */
  deleteGroup(groupId: string): void {
    this.groups.update((list) => list.filter((g) => g.id !== groupId));
    this.agents.update((list) =>
      list.map((agent) => ({
        ...agent,
        groups: (agent.groups || []).filter((id) => id !== groupId)
      }))
    );
  }

  /**
   * Check if an agent belongs to a specific group
   */
  isAgentInGroup(agent: Agent, groupId: string): boolean {
    return (agent.groups || []).includes(groupId);
  }

  /**
   * Toggle group assignment directly on the agent model
   */
  toggleAgentInGroup(agent: Agent, groupId: string): void {
    this.agents.update((list) =>
      list.map((a) => {
        if (a.id !== agent.id) return a;

        const currentGroups = a.groups || [];
        const exists = currentGroups.includes(groupId);
        const updatedGroups = exists
          ? currentGroups.filter((id) => id !== groupId)
          : [...currentGroups, groupId];

        return { ...a, groups: updatedGroups };
      })
    );
  }

  /**
   * Close dialog and pass updated state back
   */
  save(): void {
    const result: GroupDialogResult = {
      groups: this.groups(),
      agents: this.agents()
    };
    this.dialogRef.close(result);
  }
}