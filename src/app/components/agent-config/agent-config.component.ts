import { Component, ElementRef, input, signal, inject, effect, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { ApiAgentService } from '../../services/agent.service';
import { DatasourceService } from '../../services/datasource.service';
import { DatasourceUI, DatasourceUploadResponse } from '../../models/datasource.model';
import { SkillOption, CreateAgentDto, UpdateAgentDto } from '../../models/agent.model';
import { formatBytes, determineFileType } from '../../utils/file.util';

/**
 * Settings and configuration panel for customizing AI agents.
 */
@Component({
  selector: 'app-agent-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatSelectModule
  ],
  templateUrl: './agent-config.component.html',
  styleUrl: './agent-config.component.scss'
})
export class AgentConfigComponent {
  /** Mode indicator signal */
  readonly isLightMode = input.required<boolean>();

  private readonly datasourceService = inject(DatasourceService);
  readonly agentService = inject(ApiAgentService);

  /** Reference to the agent name text input */
  readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  // Reactive Form State Signals
  readonly agentName = signal<string>('');
  readonly agentDescription = signal<string>('');
  readonly systemPrompt = signal<string>('');
  readonly memoryEnabled = signal<boolean>(false);
  readonly memoryMode = signal<'user_only' | 'all'>('user_only');
  readonly memoryLimitType = signal<'all' | 'message_count'>('all');
  readonly memoryMessageCount = signal<number | null>(10);

  /** Upload status and datasource items signals */
  readonly dataSources = signal<DatasourceUI[]>([]);
  readonly isUploading = signal<boolean>(false);

  /** Available skills configuration */
  readonly skills = signal<SkillOption[]>([
    { id: '1', label: 'Fetch URL', systemName: 'fetch_url', selected: false },
    { id: '2', label: 'Run Container', systemName: 'run_container', selected: false },
    { id: '3', label: 'Use Terminal', systemName: 'use_terminal', selected: false },
    { id: '4', label: 'Call API', systemName: 'call_api', selected: false },
    { id: '5', label: 'Read Files', systemName: 'read_files', selected: false },
    { id: '6', label: 'Write Files', systemName: 'write_files', selected: false },
    { id: '7', label: 'Orchestrate Workflow', systemName: 'orchestrate_workflow', selected: false },
    { id: '8', label: 'Transform Data', systemName: 'transform_data', selected: false },
    { id: '9', label: 'Query Database', systemName: 'query_database', selected: false },
    { id: '10', label: 'Schedule Task', systemName: 'schedule_task', selected: false }
  ]);

  constructor() {
    effect(() => {
      const selected = this.agentService.selectedAgent();
      if (selected) {
        this.agentName.set(selected.name || '');
        this.agentDescription.set(selected.description || '');
        this.systemPrompt.set(selected.system_prompt || '');
        this.memoryEnabled.set(selected.memory_enabled ?? false);
        this.memoryMode.set(selected.memory_mode || 'user_only');
        this.memoryLimitType.set(selected.memory_limit_type || 'all');
        this.memoryMessageCount.set(selected.memory_message_count ?? 10);

        const activeSystemNames = new Set(selected.skills?.map((s) => s.system_name) || []);
        this.skills.update((list) =>
          list.map((s) => ({
            ...s,
            selected: activeSystemNames.has(s.systemName)
          }))
        );

        if (selected.datasources && selected.datasources.length > 0) {
          this.dataSources.set(
            selected.datasources.map((ds) => ({
              id: ds.id,
              name: ds.name || ds.filename || 'Unbenannt',
              size: formatBytes(ds.file_size),
              type: determineFileType(ds.filename),
              filename: ds.filename,
              file_size: ds.file_size
            }))
          );
        } else {
          this.dataSources.set([]);
        }
      }
    });
  }

  /**
   * Toggles the selection status of a skill pill.
   */
  toggleSkill(skillId: string): void {
    this.skills.update((list) =>
      list.map((s) => (s.id === skillId ? { ...s, selected: !s.selected } : s))
    );
  }

  /**
   * Triggers upload processing for selected files.
   */
  onFilesSelected(event: Event): void {
    const selectedAgent = this.agentService.selectedAgent();
    if (!selectedAgent) {
      console.warn('No agent selected. Please create or select an agent first.');
      return;
    }

    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.uploadFiles(selectedAgent.id, files);
    input.value = '';
  }

  private uploadFiles(agentId: string, files: File[]): void {
    this.isUploading.set(true);

    files.forEach((file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);

      this.agentService.uploadDatasource(agentId, formData).subscribe({
        next: (res: DatasourceUploadResponse) => {
          this.dataSources.update((current) => [
            ...current,
            {
              id: res.id,
              name: res.name || res.filename || 'Unbenannt',
              size: formatBytes(res.file_size || file.size),
              type: determineFileType(res.filename || file.name),
              filename: res.filename,
              file_size: res.file_size
            }
          ]);
        },
        error: (err: unknown) => console.error(`Error uploading ${file.name}:`, err),
        complete: () => this.isUploading.set(false)
      });
    });
  }

  /**
   * Saves the current form as either a new agent or an updated record.
   */
  onSave(): void {
    const selected = this.agentService.selectedAgent();

    const payload: CreateAgentDto = {
      name: this.agentName(),
      description: this.agentDescription(),
      system_prompt: this.systemPrompt(),
      skills: this.skills().filter((s) => s.selected).map((s) => s.systemName),
      memory_enabled: this.memoryEnabled(),
      memory_mode: this.memoryMode(),
      memory_limit_type: this.memoryLimitType(),
      memory_message_count:
        this.memoryLimitType() === 'message_count' ? this.memoryMessageCount() : null
    };

    if (selected) {
      this.agentService.updateAgent(selected.id, payload as UpdateAgentDto).subscribe({
        next: () => console.log('Agent updated successfully.'),
        error: (err: unknown) => console.error('Error updating agent:', err)
      });
    } else {
      this.agentService.createAgent(payload).subscribe({
        next: () => console.log('Agent created successfully.'),
        error: (err: unknown) => console.error('Error creating agent:', err)
      });
    }
  }

  /**
   * Deletes the currently active agent.
   */
  onDelete(): void {
    const selected = this.agentService.selectedAgent();
    if (!selected) return;
    this.agentService.deleteAgent(selected.id);
  }

  /**
   * Resets the entire configuration form back to default state.
   */
  resetForm(): void {
    this.agentName.set('');
    this.agentDescription.set('');
    this.systemPrompt.set('');
    this.memoryEnabled.set(false);
    this.memoryMode.set('user_only');
    this.memoryLimitType.set('all');
    this.memoryMessageCount.set(10);

    this.skills.update((skills) =>
      skills.map((s) => ({ ...s, selected: false }))
    );

    this.dataSources.set([]);

    setTimeout(() => {
      this.nameInput()?.nativeElement.focus();
    }, 0);
  }

  /**
   * Removes a linked datasource from the agent.
   *
   * @param datasourceId - Unique identifier of the datasource.
   */
  removeDatasource(datasourceId: string): void {
    const agentId = this.agentService.selectedAgent()?.id;
    if (!agentId || !datasourceId) {
      console.warn('Missing Agent ID or Datasource ID.');
      return;
    }

    this.datasourceService.deleteDatasource(agentId, datasourceId).subscribe({
      next: () => {
        this.dataSources.update((sources) =>
          sources.filter((ds) => ds.id !== datasourceId)
        );
      },
      error: (err: unknown) => {
        console.error('Error deleting datasource:', err);
      }
    });
  }
}
