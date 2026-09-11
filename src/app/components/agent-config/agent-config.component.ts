import { Component, ElementRef, input, signal, inject, effect, viewChild, Injector, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { marked } from 'marked';
import { ApiAgentService } from '../../services/agent.service';
import { DatasourceService } from '../../services/datasource.service';
import { DatasourceUI, DatasourceUploadResponse } from '../../models/datasource.model';
import { SkillOption, CreateAgentDto, UpdateAgentDto } from '../../models/agent.model';
import { formatBytes, determineFileType } from '../../utils/file.util';

export interface AgentForm {
  name: FormControl<string>;
  description: FormControl<string>;
  system_prompt: FormControl<string>;
  memory_enabled: FormControl<boolean>;
  memory_mode: FormControl<'user_only' | 'all'>;
  memory_limit_type: FormControl<'all' | 'message_count'>;
  memory_message_count: FormControl<number | null>;
}

export type ConfigTab = 'base' | 'memory_ds';
export type EditorMode = 'edit' | 'preview';

@Component({
  selector: 'app-agent-config',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatMenuModule
  ],
  templateUrl: './agent-config.component.html',
  styleUrl: './agent-config.component.scss'
})
export class AgentConfigComponent {
  readonly isLightMode = input.required<boolean>();

  private readonly fb = inject(FormBuilder);
  private readonly injector = inject(Injector);
  private readonly datasourceService = inject(DatasourceService);
  readonly agentService = inject(ApiAgentService);

  readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly promptTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('promptTextarea');

  /** Active navigation tab signal */
  readonly activeTab = signal<ConfigTab>('base');

  /** Active editor view mode signal */
  readonly editorMode = signal<EditorMode>('edit');

  readonly agentForm: FormGroup<AgentForm> = this.fb.group({
    name: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    description: this.fb.control('', { nonNullable: true }),
    system_prompt: this.fb.control('', { nonNullable: true }),
    memory_enabled: this.fb.control(false, { nonNullable: true }),
    memory_mode: this.fb.control<'user_only' | 'all'>('user_only', { nonNullable: true }),
    memory_limit_type: this.fb.control<'all' | 'message_count'>('all', { nonNullable: true }),
    memory_message_count: this.fb.control<number | null>(10)
  });

  readonly dataSources = signal<DatasourceUI[]>([]);
  readonly isUploading = signal<boolean>(false);

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
        this.agentForm.reset({
          name: selected.name || '',
          description: selected.description || '',
          system_prompt: selected.system_prompt || '',
          memory_enabled: selected.memory_enabled ?? false,
          memory_mode: selected.memory_mode || 'user_only',
          memory_limit_type: selected.memory_limit_type || 'all',
          memory_message_count: selected.memory_message_count ?? 10
        });

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

  setTab(tab: ConfigTab): void {
    this.activeTab.set(tab);
  }

  setEditorMode(mode: EditorMode): void {
    this.editorMode.set(mode);
  }

  /**
   * Applies Markdown formatting at cursor position or selection
   */
  applyFormat(prefix: string, suffix: string = prefix, defaultText: string = ''): void {
    const textarea = this.promptTextarea()?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    const selectedText = currentText.substring(start, end) || defaultText;

    const newText = 
      currentText.substring(0, start) + 
      `${prefix}${selectedText}${suffix}` + 
      currentText.substring(end);

    this.agentForm.controls.system_prompt.setValue(newText);
    this.agentForm.controls.system_prompt.markAsDirty();

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selectedText.length;
      textarea.setSelectionRange(start + prefix.length, newCursorPos);
    });
  }

  /**
   * Applies Heading formatting (H1 - H6)
   */
  applyHeading(level: number): void {
    const prefix = '#'.repeat(level) + ' ';
    this.applyFormat(prefix, '', `Heading ${level}`);
  }

  /**
   * Parses Markdown to HTML string for the preview mode using marked
   */
  get parsedMarkdown(): string {
    const rawText = this.agentForm.controls.system_prompt.value || '';
    return marked.parse(rawText) as string;
  }

  toggleSkill(skillId: string): void {
    this.skills.update((list) =>
      list.map((s) => (s.id === skillId ? { ...s, selected: !s.selected } : s))
    );
  }

  onFilesSelected(event: Event): void {
    const selectedAgent = this.agentService.selectedAgent();
    if (!selectedAgent) return;

    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.uploadFiles(selectedAgent.id, files);
    input.value = '';
  }

  private uploadFiles(agentId: string, files: File[]): void {
    this.isUploading.set(true);

    files.forEach((file) => {
      this.datasourceService.uploadDatasource(agentId, file).subscribe({
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

  onSave(): void {
    if (this.agentForm.invalid) {
      this.agentForm.markAllAsTouched();
      return;
    }

    const formValue = this.agentForm.getRawValue();
    const selected = this.agentService.selectedAgent();

    const payload: CreateAgentDto = {
      name: formValue.name,
      description: formValue.description,
      system_prompt: formValue.system_prompt,
      skills: this.skills().filter((s) => s.selected).map((s) => s.systemName),
      memory_enabled: formValue.memory_enabled,
      memory_mode: formValue.memory_mode,
      memory_limit_type: formValue.memory_limit_type,
      memory_message_count:
        formValue.memory_limit_type === 'message_count' ? formValue.memory_message_count : null
    };

    if (selected) {
      this.agentService.updateAgent(selected.id, payload as UpdateAgentDto).subscribe({
        next: () => this.agentForm.markAsPristine(),
        error: (err: unknown) => console.error('Error updating agent:', err)
      });
    } else {
      this.agentService.createAgent(payload).subscribe({
        next: () => this.agentForm.markAsPristine(),
        error: (err: unknown) => console.error('Error creating agent:', err)
      });
    }
  }

  onDelete(): void {
    const selected = this.agentService.selectedAgent();
    if (!selected) return;
    this.agentService.deleteAgent(selected.id);
  }

  resetForm(): void {
    this.agentForm.reset({
      name: '',
      description: '',
      system_prompt: '',
      memory_enabled: false,
      memory_mode: 'user_only',
      memory_limit_type: 'all',
      memory_message_count: 10
    });

    this.skills.update((skills) =>
      skills.map((s) => ({ ...s, selected: false }))
    );

    this.dataSources.set([]);

    afterNextRender(
      () => {
        this.nameInput()?.nativeElement.focus();
      },
      { injector: this.injector }
    );
  }

  removeDatasource(datasourceId: string): void {
    const agentId = this.agentService.selectedAgent()?.id;
    if (!agentId || !datasourceId) return;

    this.datasourceService.deleteDatasource(agentId, datasourceId).subscribe({
      next: () => {
        this.dataSources.update((sources) =>
          sources.filter((ds) => ds.id !== datasourceId)
        );
      },
      error: (err: unknown) => console.error('Error deleting datasource:', err)
    });
  }
}