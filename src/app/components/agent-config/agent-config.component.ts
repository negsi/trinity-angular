import { Component, ElementRef, input, signal, inject, effect, viewChild, Injector, afterNextRender, computed } from '@angular/core';
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
import { ScheduleService } from '../../services/schedule.service'; // Added Schedule Service
import { DatasourceUI, DatasourceUploadResponse } from '../../models/datasource.model';
import { SkillOption, CreateAgentDto, UpdateAgentDto } from '../../models/agent.model';
import { ScheduleTriggerType, ScheduleEntity, UpsertScheduleDto, ScheduleExecutionEntity } from '../../models/schedule.model';
import { formatBytes, determineFileType } from '../../utils/file.util';
import { toSignal } from '@angular/core/rxjs-interop';

export interface AgentForm {
  name: FormControl<string>;
  description: FormControl<string>;
  system_prompt: FormControl<string>;
  memory_enabled: FormControl<boolean>;
  memory_mode: FormControl<'user_only' | 'all'>;
  memory_limit_type: FormControl<'all' | 'message_count'>;
  memory_message_count: FormControl<number | null>;
}

export interface ScheduleForm {
  name: FormControl<string>;
  trigger_type: FormControl<ScheduleTriggerType>;
  cron_expression: FormControl<string>;
  scheduled_date: FormControl<string>;
  scheduled_time: FormControl<string>;
  prompt: FormControl<string>;
  is_active: FormControl<boolean>;
}

export interface CronPreset {
  label: string;
  expression: string;
}

export type ConfigTab = 'base' | 'memory_ds' | 'schedules';
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
  private readonly scheduleService = inject(ScheduleService); // Injected Schedule Service
  readonly agentService = inject(ApiAgentService);

  readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly promptTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('promptTextarea');

  /** Active navigation tab signal */
  readonly activeTab = signal<ConfigTab>('base');

  /** Active editor view mode signal */
  readonly editorMode = signal<EditorMode>('edit');

  /** List of schedules configured for the selected agent */
  readonly agentSchedules = signal<ScheduleEntity[]>([]);
  /** Currently selected schedule entity for editing */
  readonly selectedSchedule = signal<ScheduleEntity | null>(null);
  /** Execution history list for the selected schedule */
  readonly scheduleExecutions = signal<ScheduleExecutionEntity[]>([]);
  readonly isLoadingSchedules = signal<boolean>(false);

  readonly agentForm: FormGroup<AgentForm> = this.fb.group({
    name: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    description: this.fb.control('', { nonNullable: true }),
    system_prompt: this.fb.control('', { nonNullable: true }),
    memory_enabled: this.fb.control(false, { nonNullable: true }),
    memory_mode: this.fb.control<'user_only' | 'all'>('user_only', { nonNullable: true }),
    memory_limit_type: this.fb.control<'all' | 'message_count'>('all', { nonNullable: true }),
    memory_message_count: this.fb.control<number | null>(10)
  });

  /** Form group for managing current schedule configuration */
  readonly scheduleForm: FormGroup<ScheduleForm> = this.fb.group({
    name: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    trigger_type: this.fb.control<ScheduleTriggerType>('cron', { nonNullable: true }),
    cron_expression: this.fb.control('0 8 * * *', { nonNullable: true }),
    scheduled_date: this.fb.control('', { nonNullable: true }),
    scheduled_time: this.fb.control('08:00', { nonNullable: true }),
    prompt: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    is_active: this.fb.control(true, { nonNullable: true })
  });

  /** Common Cron expression presets for user convenience */
  readonly cronPresets: CronPreset[] = [
    { label: 'Stündlich (:00)', expression: '0 * * * *' },
    { label: 'Täglich um 08:00', expression: '0 8 * * *' },
    { label: 'Täglich um 18:00', expression: '0 18 * * *' },
    { label: 'Jeden Montag um 09:00', expression: '0 9 * * 1' },
    { label: 'Monatlich am 1. um 08:00', expression: '0 8 1 * *' }
  ];

  readonly dataSources = signal<DatasourceUI[]>([]);
  readonly isUploading = signal<boolean>(false);

  readonly systemPromptValue = toSignal(
    this.agentForm.controls.system_prompt.valueChanges,
    { initialValue: this.agentForm.controls.system_prompt.value }
  );

  readonly parsedMarkdown = computed(() => {
    const rawText = this.systemPromptValue() || '';
    return marked.parse(rawText) as string;
  });

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

  /** Steuerung für den Ausführungsverlauf-Dropdown-Bereich */
  readonly isExecutionsOpen = signal<boolean>(false);
  /** Limit für angezeigte Verlaufseinträge */
  readonly executionLimit = signal<number>(10);

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

        // Load schedules for the selected agent
        this.loadAgentSchedules(selected.id);
      } else {
        this.agentSchedules.set([]);
        this.selectedSchedule.set(null);
        this.scheduleExecutions.set([]);
      }
    });
  }

  /** Berechnete, limitierte Liste von Ausführungen */
  readonly limitedExecutions = computed(() => {
    const list = this.scheduleExecutions();
    const limit = this.executionLimit();
    return list.slice(0, limit);
  });

  toggleExecutionsDropdown(): void {
    this.isExecutionsOpen.update((val) => !val);
  }

  updateExecutionLimit(event: Event): void {
    const val = +(event.target as HTMLSelectElement).value;
    this.executionLimit.set(val);
  }

  /** Löschen eines Schedules direkt über die obere Liste per ID */
  onDeleteScheduleItem(scheduleId: string): void {
    this.scheduleService.deleteSchedule(scheduleId).subscribe({
      next: () => {
        this.agentSchedules.update((list) => list.filter((s) => s.id !== scheduleId));
        if (this.selectedSchedule()?.id === scheduleId) {
          const remaining = this.agentSchedules();
          if (remaining.length > 0) {
            this.selectSchedule(remaining[0]);
          } else {
            this.resetScheduleForm();
          }
        }
      },
      error: (err) => console.error('Failed to delete schedule:', err)
    });
  }

  /**
   * Fetches all schedules for the given agent from backend
   */
  loadAgentSchedules(agentId: string): void {
    this.isLoadingSchedules.set(true);
    this.scheduleService.getAgentSchedules(agentId).subscribe({
      next: (schedules) => {
        this.agentSchedules.set(schedules);
        if (schedules.length > 0) {
          this.selectSchedule(schedules[0]);
        } else {
          this.resetScheduleForm();
        }
        this.isLoadingSchedules.set(false);
      },
      error: (err) => {
        console.error('Failed to load agent schedules:', err);
        this.isLoadingSchedules.set(false);
      }
    });
  }

  /**
   * Selects and loads a schedule into the form
   */
  selectSchedule(schedule: ScheduleEntity): void {
    this.selectedSchedule.set(schedule);
    
    let dateStr = '';
    let timeStr = '08:00';
    if (schedule.scheduled_at) {
      const dt = new Date(schedule.scheduled_at);
      dateStr = dt.toISOString().split('T')[0];
      timeStr = dt.toTimeString().substring(0, 5);
    }

    this.scheduleForm.patchValue({
      name: schedule.name,
      trigger_type: schedule.trigger_type,
      cron_expression: schedule.cron_expression || '0 8 * * *',
      scheduled_date: dateStr,
      scheduled_time: timeStr,
      prompt: schedule.prompt,
      is_active: schedule.is_active
    });

    this.loadScheduleExecutions(schedule.id);
  }

  /**
   * Loads execution history for a schedule
   */
  loadScheduleExecutions(scheduleId: string): void {
    this.scheduleService.getScheduleExecutions(scheduleId).subscribe({
      next: (executions) => this.scheduleExecutions.set(executions),
      error: (err) => console.error('Failed to load schedule executions:', err)
    });
  }

  /**
   * Resets schedule form for creating a new schedule
   */
  resetScheduleForm(): void {
    this.selectedSchedule.set(null);
    this.scheduleForm.reset({
      name: '',
      trigger_type: 'cron',
      cron_expression: '0 8 * * *',
      scheduled_date: '',
      scheduled_time: '08:00',
      prompt: '',
      is_active: true
    });
    this.scheduleExecutions.set([]);
  }

  /**
   * Saves or updates the schedule via backend API
   */
  onSaveSchedule(): void {

    if (this.scheduleForm.invalid) {
      this.scheduleForm.markAllAsTouched();
      return;
    }

    const agentId = this.agentService.selectedAgent()?.id;
    if (!agentId) return;

    const formVal = this.scheduleForm.getRawValue();
    let scheduledAtIso: string | null = null;
    
    if (formVal.trigger_type === 'once' && formVal.scheduled_date && formVal.scheduled_time) {
      scheduledAtIso = new Date(`${formVal.scheduled_date}T${formVal.scheduled_time}:00`).toISOString();
    }

    const dto: UpsertScheduleDto = {
      name: formVal.name,
      prompt: formVal.prompt,
      trigger_type: formVal.trigger_type,
      is_active: formVal.is_active,
      cron_expression: formVal.trigger_type === 'cron' ? formVal.cron_expression : null,
      scheduled_at: scheduledAtIso
    };

    const currentSchedule = this.selectedSchedule();

    if (currentSchedule) {
      this.scheduleService.updateSchedule(agentId, currentSchedule.id, dto).subscribe({
        next: (updated) => {
          this.agentSchedules.update((list) => list.map((s) => s.id === updated.id ? updated : s));
          this.selectSchedule(updated);
        },
        error: (err) => console.error('Failed to update schedule:', err)
      });
    } else {
      this.scheduleService.createSchedule(agentId, dto).subscribe({
        next: (created) => {
          this.agentSchedules.update((list) => [...list, created]);
          this.selectSchedule(created);
        },
        error: (err) => console.error('Failed to create schedule:', err)
      });
    }
  }

  /**
   * Deletes the currently selected schedule
   */
  onDeleteSchedule(): void {
    const current = this.selectedSchedule();
    if (!current) return;

    this.scheduleService.deleteSchedule(current.id).subscribe({
      next: () => {
        this.agentSchedules.update((list) => list.filter((s) => s.id !== current.id));
        const remaining = this.agentSchedules();
        if (remaining.length > 0) {
          this.selectSchedule(remaining[0]);
        } else {
          this.resetScheduleForm();
        }
      },
      error: (err) => console.error('Failed to delete schedule:', err)
    });
  }

  /**
   * Triggers an immediate manual test execution ('Run Now')
   */
  onRunScheduleNow(): void {
    const current = this.selectedSchedule();
    if (!current) return;

    this.scheduleService.runScheduleNow(current.id).subscribe({
      next: (execution) => {
        this.scheduleExecutions.update((list) => [execution, ...list]);
      },
      error: (err) => console.error('Failed to run schedule immediately:', err)
    });
  }

  setTab(tab: ConfigTab): void {
    this.activeTab.set(tab);
  }

  setEditorMode(mode: EditorMode): void {
    this.editorMode.set(mode);
  }

  setTriggerType(type: ScheduleTriggerType): void {
    this.scheduleForm.controls.trigger_type.setValue(type);
  }

  applyCronPreset(expression: string): void {
    this.scheduleForm.controls.cron_expression.setValue(expression);
    this.scheduleForm.controls.cron_expression.markAsDirty();
  }

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

  applyHeading(level: number): void {
    const prefix = '#'.repeat(level) + ' ';
    this.applyFormat(prefix, '', `Heading ${level}`);
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