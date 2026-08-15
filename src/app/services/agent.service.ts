import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Agent, CreateAgentDto, UpdateAgentDto } from '../models/agent.model';
import { DatasourceUploadResponse } from '../models/datasource.model';

/**
 * Core service managing agent entities and selection states.
 */
@Injectable({
  providedIn: 'root'
})
export class ApiAgentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/agents';

  /** Indicates whether a new agent creation flow is active */
  readonly isCreating = signal<boolean>(false);

  /** List of all loaded agents */
  readonly agents = signal<Agent[]>([]);

  /** Currently selected agent entity or null */
  readonly selectedAgent = signal<Agent | null>(null);

  /** Loading indicator flag */
  readonly isLoading = signal<boolean>(false);

  /** Current error message, if any */
  readonly error = signal<string | null>(null);

  /**
   * Fetches all agents from the API and updates state signals.
   */
  loadAgents(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.http.get<Agent[]>(this.baseUrl).subscribe({
      next: (data: Agent[]) => {
        this.agents.set(data);
        if (data.length > 0 && !this.selectedAgent()) {
          this.selectedAgent.set(data[0]);
        }
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        console.error('Failed to load agents:', err);
        this.error.set('Failed to load agents.');
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Prepares the workspace state for creating a new agent.
   */
  startCreating(): void {
    this.selectedAgent.set(null);
    this.isCreating.set(true);
  }

  /**
   * Selects an active agent.
   *
   * @param agent - The agent to select.
   */
  selectAgent(agent: Agent): void {
    this.isCreating.set(false);
    this.selectedAgent.set(agent);
  }

  /**
   * Deselects the current agent.
   */
  clearSelection(): void {
    this.selectedAgent.set(null);
  }

  /**
   * Creates a new agent on the backend.
   *
   * @param payload - Configuration data for the new agent.
   * @returns Observable emitting the created agent.
   */
  createAgent(payload: CreateAgentDto): Observable<Agent> {
    return this.http.post<Agent>(this.baseUrl, payload).pipe(
      tap((newAgent: Agent) => {
        this.agents.update((list) => [...list, newAgent]);
        this.selectedAgent.set(newAgent);
        this.isCreating.set(false);
      })
    );
  }

  /**
   * Updates an existing agent.
   *
   * @param id - Unique identifier of the agent.
   * @param payload - Partial configuration data to update.
   * @returns Observable emitting the updated agent.
   */
  updateAgent(id: string, payload: UpdateAgentDto): Observable<Agent> {
    return this.http.put<Agent>(`${this.baseUrl}/${id}`, payload).pipe(
      tap((updatedAgent: Agent) => {
        this.agents.update((list) =>
          list.map((item) => (item.id === id ? updatedAgent : item))
        );
        this.selectedAgent.set(updatedAgent);
      })
    );
  }

  /**
   * Deletes an agent by its ID.
   *
   * @param id - Unique identifier of the agent to delete.
   */
  deleteAgent(id: string): void {
    this.http.delete<void>(`${this.baseUrl}/${id}`).subscribe({
      next: () => {
        const updatedList = this.agents().filter((a) => a.id !== id);
        this.agents.set(updatedList);

        if (this.selectedAgent()?.id === id) {
          this.selectedAgent.set(updatedList.length > 0 ? updatedList[0] : null);
        }
      },
      error: (err: unknown) => {
        console.error('Failed to delete agent:', err);
      }
    });
  }

  /**
   * Uploads a file datasource for a specific agent.
   *
   * @param agentId - The agent ID to attach the file to.
   * @param formData - FormData payload containing the file.
   * @returns Observable emitting the uploaded datasource metadata.
   */
  uploadDatasource(agentId: string, formData: FormData): Observable<DatasourceUploadResponse> {
    return this.http.post<DatasourceUploadResponse>(
      `${this.baseUrl}/${agentId}/datasources`,
      formData
    );
  }
}
