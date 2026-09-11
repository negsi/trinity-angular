import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Agent, CreateAgentDto, UpdateAgentDto } from '../models/agent.model';

export interface ConversationDto {
  id: string;
  agent_id: string;
  title: string;
  created_at?: string;
}

/**
 * Core service managing agent entities and active workspace selection state.
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

  /** Currently selected agent entity or null for Solo mode */
  readonly selectedAgent = signal<Agent | null>(null);

  /** Selected agents array for Crew mode (maximum 4) */
  readonly selectedCrewAgents = signal<Agent[]>([]);

  /** Currently active conversation ID */
  readonly activeConversationId = signal<string | null>(null);

  /** List of conversations for the selected agent */
  readonly conversations = signal<ConversationDto[]>([]);

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
          this.selectAgent(data[0]);
        }
        if (data.length > 0 && this.selectedCrewAgents().length === 0) {
          this.selectedCrewAgents.set([data[0]]);
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
    this.activeConversationId.set(null);
    this.conversations.set([]);
    this.isCreating.set(true);
  }

  /**
   * Selects an active single agent (Solo Mode) and loads its conversations.
   *
   * @param agent - The agent to select.
   */
  selectAgent(agent: Agent): void {
    this.isCreating.set(false);
    this.selectedAgent.set(agent);
    this.activeConversationId.set(null);
  }

  /**
   * Fetches conversations for the given agent and selects the first one if available.
   */
  loadAgentConversations(agentId: string): void {
    this.http.get<ConversationDto[]>(`${this.baseUrl}/${agentId}/conversations`).subscribe({
      next: (convs) => {
        this.conversations.set(convs);
        if (convs.length > 0) {
          this.activeConversationId.set(convs[0].id);
        } else {
          this.activeConversationId.set(null);
        }
      },
      error: (err) => {
        console.error('Failed to load conversations:', err);
        this.conversations.set([]);
        this.activeConversationId.set(null);
      }
    });
  }

  /**
   * Sets the active conversation ID directly.
   */
  setActiveConversation(conversationId: string | null): void {
    this.activeConversationId.set(conversationId);
  }

  /**
   * Toggles selection of an agent in Crew mode (max 4).
   */
  toggleCrewAgent(agent: Agent): void {
    this.selectedCrewAgents.update((current) => {
      const exists = current.some((a) => a.id === agent.id);
      if (exists) {
        return current.filter((a) => a.id !== agent.id);
      }
      if (current.length >= 4) {
        return current;
      }
      return [...current, agent];
    });
  }

  /**
   * Deselects the current agent.
   */
  clearSelection(): void {
    this.selectedAgent.set(null);
    this.activeConversationId.set(null);
    this.conversations.set([]);
  }

  /**
   * Creates a new agent on the backend.
   */
  createAgent(payload: CreateAgentDto): Observable<Agent> {
    return this.http.post<Agent>(this.baseUrl, payload).pipe(
      tap((newAgent: Agent) => {
        this.agents.update((list) => [...list, newAgent]);
        this.selectAgent(newAgent);
        this.isCreating.set(false);
      })
    );
  }

  /**
   * Updates an existing agent.
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
   */
  deleteAgent(id: string): void {
    this.http.delete<void>(`${this.baseUrl}/${id}`).subscribe({
      next: () => {
        const updatedList = this.agents().filter((a) => a.id !== id);
        this.agents.set(updatedList);

        if (this.selectedAgent()?.id === id) {
          if (updatedList.length > 0) {
            this.selectAgent(updatedList[0]);
          } else {
            this.clearSelection();
          }
        }
        this.selectedCrewAgents.update((crew) => crew.filter((a) => a.id !== id));
      },
      error: (err: unknown) => {
        console.error('Failed to delete agent:', err);
      }
    });
  }
}