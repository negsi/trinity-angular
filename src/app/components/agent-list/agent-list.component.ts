import { Component, input, inject, OnInit, signal, computed, output, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiAgentService } from '../../services/agent.service';
import { ApiGroupService } from '../../services/group.service';
import { Agent } from '../../models/agent.model';
import { Group } from '../../models/group.model';
import { getInitials, getAvatarColor } from '../../utils/avatar.util';

export type AgentViewMode = 'single' | 'multi';
export type AgentSortMode = 'recent' | 'name' | 'created';

@Component({
  selector: 'app-agent-list',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    MatIconModule, 
    MatButtonModule, 
    MatTooltipModule,
    MatMenuModule,
    MatCheckboxModule
  ],
  templateUrl: './agent-list.component.html',
  styleUrl: './agent-list.component.scss'
})
export class AgentListComponent implements OnInit {
  private readonly COLLAPSE_KEY = 'trinity_agent_list_collapsed';
  private readonly VIEW_MODE_KEY = 'trinity_agent_view_mode';
  private readonly VISIBLE_GROUPS_KEY = 'trinity_visible_groups';
  private readonly COLLAPSED_GROUPS_KEY = 'trinity_collapsed_groups';
  private readonly SORT_MODE_KEY = 'trinity_agent_sort_mode';

  @ViewChild('groupInput') groupInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('renameInput') renameInputRef?: ElementRef<HTMLInputElement>;

  readonly isLightMode = input.required<boolean>();
  readonly isCollapsed = signal<boolean>(this.getInitialCollapseState());

  // Search Signal
  readonly searchQuery = signal<string>('');

  // Inline Add-Group State
  readonly isCreatingGroup = signal<boolean>(false);
  newGroupName = '';

  // Inline Rename-Group State
  readonly editingGroupId = signal<string | null>(null);
  readonly editingGroupName = signal<string>('');

  readonly visibleGroupIds = signal<Set<string>>(this.getInitialVisibleGroups());
  readonly collapsedGroupIds = signal<Set<string>>(this.getInitialCollapsedGroups());

  readonly viewMode = signal<AgentViewMode>(this.getInitialViewMode());
  readonly sortMode = signal<AgentSortMode>(this.getInitialSortMode());
  readonly viewModeChange = output<AgentViewMode>();

  readonly agentService = inject(ApiAgentService);
  readonly groupService = inject(ApiGroupService);

  readonly getInitials = getInitials;
  readonly getAvatarBg = getAvatarColor;

  readonly selectedAgentIds = computed(() => {
    if (this.viewMode() === 'single') {
      const selected = this.agentService.selectedAgent();
      return selected ? [selected.id] : [];
    } else {
      return this.agentService.selectedCrewAgents().map((agent) => agent.id);
    }
  });

  readonly sortedGroups = computed(() => {
    return [...this.groupService.groups()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    );
  });

  // Filtering & Grouping Logic
  readonly filteredAgents = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allAgents = [...this.agentService.agents()];
    const mode = this.sortMode();

    allAgents.sort((a, b) => {
      if (mode === 'name') {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
      }
      
      if (mode === 'created') {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      }

      if (mode === 'recent') {
        // Sort by last interaction date descending
        const timeA = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const timeB = b.last_interaction_at ? new Date(b.last_interaction_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
        return timeB - timeA;
      }

      return 0;
    });

    if (!query) return allAgents;

    return allAgents.filter((agent) =>
      agent.name.toLowerCase().includes(query) ||
      (agent.description && agent.description.toLowerCase().includes(query))
    );
  });

  readonly groupedViewData = computed(() => {
    const agents = this.filteredAgents();
    // English comment: Use sortedGroups instead of un-sorted raw groups
    const activeGroups = this.sortedGroups().filter((g) => this.visibleGroupIds().has(g.id));
    
    if (activeGroups.length === 0) {
      return { grouped: [], ungrouped: agents };
    }

    const assignedAgentIds = new Set<string>();
    const groupedResult = activeGroups.map((group) => {
      const groupAgents = agents.filter((a) => {
        const belongsToGroup = (a.groups || []).includes(group.id);
        if (belongsToGroup) {
          assignedAgentIds.add(a.id);
        }
        return belongsToGroup;
      });
      return {
        group,
        agents: groupAgents,
        isCollapsed: this.collapsedGroupIds().has(group.id)
      };
    });

    const ungrouped = agents.filter((a) => !assignedAgentIds.has(a.id));

    return { grouped: groupedResult, ungrouped };
  });

  ngOnInit(): void {
    this.agentService.loadAgents();
    this.groupService.loadGroups();
  }

  private getInitialCollapseState(): boolean {
    return localStorage.getItem(this.COLLAPSE_KEY) === 'true';
  }

  private getInitialViewMode(): AgentViewMode {
    const saved = localStorage.getItem(this.VIEW_MODE_KEY);
    return (saved === 'single' || saved === 'multi') ? saved : 'single';
  }

  private getInitialVisibleGroups(): Set<string> {
    const saved = localStorage.getItem(this.VISIBLE_GROUPS_KEY);
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {
        // Fallback
      }
    }
    return new Set<string>();
  }

  private saveVisibleGroups(set: Set<string>): void {
    this.visibleGroupIds.set(new Set(set));
    localStorage.setItem(this.VISIBLE_GROUPS_KEY, JSON.stringify(Array.from(set)));
  }

  toggleGroupVisibility(groupId: string): void {
    if (event) event.stopPropagation();
    const current = new Set(this.visibleGroupIds());
    if (current.has(groupId)) {
      current.delete(groupId);
    } else {
      current.add(groupId);
    }
    this.saveVisibleGroups(current);
  }

  toggleGroupCollapse(groupId: string): void {
    const current = new Set(this.collapsedGroupIds());
    if (current.has(groupId)) {
      current.delete(groupId);
    } else {
      current.add(groupId);
    }
    this.saveCollapsedGroups(current);
  }

  // Inline Add Group
  startAddGroup(event: Event): void {
    event.stopPropagation();
    this.newGroupName = '';
    this.isCreatingGroup.set(true);
    setTimeout(() => {
      this.groupInputRef?.nativeElement.focus();
    }, 50);
  }

  commitAddGroup(event?: Event): void {
    if (event) event.stopPropagation();
    const name = this.newGroupName.trim();
    
    if (!name) {
      this.isCreatingGroup.set(false);
      return;
    }

    this.groupService.createGroup({ name }).subscribe({
      next: (created) => {
        const visible = new Set(this.visibleGroupIds());
        visible.add(created.id);
        this.saveVisibleGroups(visible);

        this.newGroupName = '';
        this.isCreatingGroup.set(false);
      },
      error: () => {
        this.isCreatingGroup.set(false);
      }
    });
  }

  cancelAddGroup(event?: Event): void {
    if (event) event.stopPropagation();
    this.newGroupName = '';
    this.isCreatingGroup.set(false);
  }

  // Inline Rename Group
  startGroupRename(event: Event, group: Group): void {
    event.stopPropagation();
    this.editingGroupId.set(group.id);
    this.editingGroupName.set(group.name);
    setTimeout(() => {
      this.renameInputRef?.nativeElement.focus();
      this.renameInputRef?.nativeElement.select();
    }, 50);
  }

  saveGroupRename(groupId: string, event: Event): void {
    event.stopPropagation();
    if (this.editingGroupId() !== groupId) return;

    const newName = this.editingGroupName().trim();
    this.editingGroupId.set(null);

    if (!newName) return;

    this.groupService.updateGroup(groupId, { name: newName }).subscribe();
  }

  cancelGroupRename(event: Event): void {
    event.stopPropagation();
    this.editingGroupId.set(null);
  }

  deleteGroup(groupId: string, event: Event): void {
    event.stopPropagation();
    this.groupService.deleteGroup(groupId).subscribe({
      next: () => {
        const visible = new Set(this.visibleGroupIds());
        visible.delete(groupId);
        this.saveVisibleGroups(visible);
      }
    });
  }

  toggleCollapse(): void {
    this.isCollapsed.update((val) => {
      const nextState = !val;
      localStorage.setItem(this.COLLAPSE_KEY, String(nextState));
      return nextState;
    });
  }

  setViewMode(mode: AgentViewMode): void {
    this.viewMode.set(mode);
    localStorage.setItem(this.VIEW_MODE_KEY, mode);
    this.viewModeChange.emit(mode);

    if (mode === 'multi' && this.agentService.selectedCrewAgents().length === 0) {
      const current = this.agentService.selectedAgent();
      if (current) {
        this.agentService.toggleCrewAgent(current);
      }
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  onAgentClick(agent: Agent): void {
    if (this.viewMode() === 'single') {
      this.agentService.selectAgent(agent);
    } else {
      this.agentService.toggleCrewAgent(agent);
    }
  }

  isCrewSelected(agentId: string): boolean {
    return this.agentService.selectedCrewAgents().some((a) => a.id === agentId);
  }

  isGroupCheckedForSelected(groupId: string): boolean {
    const selectedIds = this.selectedAgentIds();
    if (selectedIds.length === 0) return false;

    const agents = this.agentService.agents();
    return selectedIds.every((id) => {
      const agent = agents.find((a) => a.id === id);
      return agent?.groups?.includes(groupId) ?? false;
    });
  }

  toggleGroupForSelectedAgents(groupId: string, isChecked: boolean): void {
    const selectedIds = this.selectedAgentIds();
    if (selectedIds.length === 0) return;

    this.agentService.agents.update((agents) =>
      agents.map((agent) => {
        if (!selectedIds.includes(agent.id)) return agent;

        const currentGroups = agent.groups || [];
        const updatedGroups = isChecked
          ? Array.from(new Set([...currentGroups, groupId]))
          : currentGroups.filter((gId) => gId !== groupId);

        return { ...agent, groups: updatedGroups };
      })
    );

    this.groupService.groups.update((groups) =>
      groups.map((group) => {
        if (group.id !== groupId) return group;

        const currentCount = this.agentService
          .agents()
          .filter((a) => a.groups?.includes(groupId)).length;

        return { ...group, agent_count: currentCount };
      })
    );

    const allGroupAgents = this.agentService
      .agents()
      .filter((a) => a.groups?.includes(groupId))
      .map((a) => a.id);

    this.groupService.updateGroupAgents(groupId, allGroupAgents).subscribe({
      error: () => {
        this.agentService.loadAgents();
        this.groupService.loadGroups();
      }
    });
  }

  private getInitialCollapsedGroups(): Set<string> {
    const saved = localStorage.getItem(this.COLLAPSED_GROUPS_KEY);
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {
        // Fallback
      }
    }
    return new Set<string>();
  }

  private saveCollapsedGroups(set: Set<string>): void {
    this.collapsedGroupIds.set(new Set(set));
    localStorage.setItem(this.COLLAPSED_GROUPS_KEY, JSON.stringify(Array.from(set)));
  }

  private getInitialSortMode(): AgentSortMode {
    const saved = localStorage.getItem(this.SORT_MODE_KEY);
    return (saved === 'recent' || saved === 'name' || saved === 'created') 
      ? (saved as AgentSortMode) 
      : 'recent';
  }

  toggleSortMode(): void {
    const modes: AgentSortMode[] = ['recent', 'name', 'created'];
    const currentIndex = modes.indexOf(this.sortMode());
    const nextMode = modes[(currentIndex + 1) % modes.length];
    
    this.sortMode.set(nextMode);
    localStorage.setItem(this.SORT_MODE_KEY, nextMode);
  }
}