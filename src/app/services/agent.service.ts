import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Agent } from '../models/agent.model';
import { tap, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiAgentService {
  private http = inject(HttpClient);
  //private readonly baseUrl = 'http://localhost:5000/api/v1/agents';
  private readonly baseUrl = '/api/v1/agents';
  readonly isCreating = signal<boolean>(false);

  // Signals für reaktiven State in den Komponenten
  agents = signal<Agent[]>([]);
  selectedAgent = signal<Agent | null>(null);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  /**
   * Lädt alle Agenten per AJAX ab und aktualisiert das Signal.
   */
  loadAgents(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.http.get<Agent[]>(this.baseUrl).subscribe({
      next: (data) => {
        this.agents.set(data);
        // Falls noch kein Agent ausgewählt ist, wähle den ersten aus
        if (data.length > 0 && !this.selectedAgent()) {
          this.selectedAgent.set(data[0]);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Fehler beim Laden der Agenten:', err);
        this.error.set('Agenten konnten nicht geladen werden.');
        this.isLoading.set(false);
      }
    });
  }

  startCreating() {
    this.selectedAgent.set(null); // Kein Agent ausgewählt
    this.isCreating.set(true);
  }

  selectAgent(agent: Agent): void {
    this.isCreating.set(false);
    this.selectedAgent.set(agent);
  }

  clearSelection(): void {
    this.selectedAgent.set(null);
  }

  createAgent(payload: any) {
    return this.http.post<Agent>(this.baseUrl, payload).pipe(
      tap(newAgent => {
        // Liste aktualisieren & den neuen Agenten direkt selektieren
        this.agents.update(list => [...list, newAgent]);
        this.selectedAgent.set(newAgent);
      })
    );
  }

  updateAgent(id: string, payload: any) {
    return this.http.put<Agent>(`${this.baseUrl}/${id}`, payload).pipe(
      tap(updatedAgent => {
        // In der lokalen Liste austauschen
        this.agents.update(list => list.map(a => a.id === id ? updatedAgent : a));
        this.selectedAgent.set(updatedAgent);
      })
    );
  }

  deleteAgent(id: string): void {
    this.http.delete(`${this.baseUrl}/${id}`).subscribe({
      next: () => {
        // Agenten aus der lokalen Liste filtern
        const updatedList = this.agents().filter(a => a.id !== id);
        this.agents.set(updatedList);

        // Falls der gelöschte Agent gerade selektiert war, den nächsten auswählen
        if (this.selectedAgent()?.id === id) {
          this.selectedAgent.set(updatedList.length > 0 ? updatedList[0] : null);
        }
      },
      error: (err) => {
        console.error('Fehler beim Löschen des Agenten:', err);
        alert('Der Agent konnte nicht gelöscht werden.');
      }
    });
  }

  uploadDatasource(agentId: string, formData: FormData): Observable<any> {
    return this.http.post<any>(`/api/v1/agents/${agentId}/datasources`, formData);
  }
}