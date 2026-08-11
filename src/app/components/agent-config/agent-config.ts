import { Component, ElementRef, input, signal, inject, effect, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ApiAgentService } from '../../services/agent.service';
import { DatasourceService } from '../../services/datasource.service';
import { Datasource } from '../../services/datasource.service';

export interface SkillOption {
  id: string;
  label: string;
  systemName: string;
  selected: boolean;
}

@Component({
  selector: 'app-agent-config',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule],
  templateUrl: './agent-config.html',
  styleUrl: './agent-config.scss'
})
export class AgentConfigComponent {
  isLightMode = input.required<boolean>();
  private datasourceService = inject(DatasourceService);
  agentService = inject(ApiAgentService);

  // Formular-Signals
  agentName = signal<string>('');
  agentDescription = signal<string>('');
  systemPrompt = signal<string>('');
  
  // State für den Upload-Status
  dataSources = signal<Datasource[]>([]);
  isUploading = signal<boolean>(false);

  nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  skills = signal<SkillOption[]>([
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

        const activeSystemNames = new Set(selected.skills?.map(s => s.system_name) || []);
        this.skills.update(list =>
          list.map(s => ({
            ...s,
            selected: activeSystemNames.has(s.systemName)
          }))
        );

        if (selected.datasources) {
          this.dataSources.set(
            selected.datasources.map(ds => ({
              id: ds.id,
              name: ds.name || ds.filename || 'Unbenannt',
              size: this.formatBytes(ds.file_size),
              type: this.determineFileType(ds.filename)
            }))
          );
        } else {
          this.dataSources.set([]);
        }
      }
    });
  }

  toggleSkill(skillId: string): void {
    this.skills.update(list =>
      list.map(s => (s.id === skillId ? { ...s, selected: !s.selected } : s))
    );
  }

  /**
   * Wird aufgerufen, sobald der Nutzer Dateien auswählt
   */
  onFilesSelected(event: Event): void {
    const selectedAgent = this.agentService.selectedAgent();
    if (!selectedAgent) {
      console.warn('Kein Agent ausgewählt. Speichere den Agenten zuerst.');
      return;
    }

    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.uploadFiles(selectedAgent.id, files);

    // Input für erneute Auswahl zurücksetzen
    input.value = '';
  }

  /**
   * Lädt die ausgewählten Dateien nacheinander über deine bestehende API hoch
   */
  private uploadFiles(agentId: string, files: File[]): void {
    this.isUploading.set(true);

    files.forEach((file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);

      this.agentService.uploadDatasource(agentId, formData).subscribe({
        next: (res) => {
          // Neues File zur Liste hinzufügen
          this.dataSources.update(current => [
            ...current,
            {
              id: res.id,
              name: res.name || res.filename || 'Unbenannt',
              size: this.formatBytes(res.file_size || file.size),
              type: this.determineFileType(res.filename || file.name)
            }
          ]);
        },
        error: (err) => console.error(`Fehler beim Upload von ${file.name}:`, err),
        complete: () => this.isUploading.set(false)
      });
    });
  }

  private determineFileType(filename: string): 'pdf' | 'xls' | 'doc' {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) return 'xls';
    return 'doc';
  }

  private formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 KB';
    const kb = Math.round(bytes / 1024);
    return `${kb} KB`;
  }

  onSave(): void {
    const selected = this.agentService.selectedAgent();

    const payload = {
      name: this.agentName(),
      description: this.agentDescription(),
      system_prompt: this.systemPrompt(),
      skills: this.skills().filter(s => s.selected).map(s => s.systemName)
    };

    if (selected) {
      console.log('Aktualisiere Agent:', selected.id, payload);
      this.agentService.updateAgent(selected.id, payload).subscribe({
        next: () => console.log('Agent erfolgreich aktualisiert!'),
        error: (err) => console.error('Fehler beim Aktualisieren:', err)
      });
    } else {
      console.log('Erstelle neuen Agenten:', payload);
      this.agentService.createAgent(payload).subscribe({
        next: () => console.log('Neuer Agent erfolgreich erstellt!'),
        error: (err) => console.error('Fehler beim Erstellen:', err)
      });
    }
  }

  onDelete(): void {
    const selected = this.agentService.selectedAgent();
    if (!selected) return;

    this.agentService.deleteAgent(selected.id);
  }

  resetForm(): void {
    this.agentName.set('');
    this.agentDescription.set('');
    this.systemPrompt.set('');
    
    this.skills.update(skills => 
      skills.map(s => ({ ...s, selected: false }))
    );
    
    this.dataSources.set([]);

    setTimeout(() => {
      this.nameInput()?.nativeElement.focus();
    }, 0);
  }

  removeDatasource(datasourceId: string): void {
    const agentId = this.agentService.selectedAgent()?.id;
    
    if (!agentId || !datasourceId) {
      console.warn('Agent-ID oder Datasource-ID fehlt.');
      return;
    }

    this.datasourceService.deleteDatasource(agentId, datasourceId).subscribe({
      next: () => {
        // Erfolgreich gelöscht: Aus dem Signal filtern (UI aktualisiert sich automatisch)
        this.dataSources.update(sources => 
          sources.filter(ds => ds.id !== datasourceId)
        );
      },
      error: (err) => {
        console.error('Fehler beim Löschen der Datasource:', err);
      }
    });
  }
}