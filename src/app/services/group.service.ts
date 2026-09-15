import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Group, CreateGroupDto, UpdateGroupDto } from '../models/group.model';

@Injectable({
  providedIn: 'root'
})
export class ApiGroupService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/groups';

  readonly groups = signal<Group[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  loadGroups(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.http.get<Group[]>(this.baseUrl).subscribe({
      next: (data) => {
        this.groups.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load groups:', err);
        this.error.set('Failed to load groups.');
        this.isLoading.set(false);
      }
    });
  }

  createGroup(payload: CreateGroupDto): Observable<Group> {
    return this.http.post<Group>(this.baseUrl, payload).pipe(
      tap((newGroup) => {
        this.groups.update((list) => [...list, newGroup]);
      })
    );
  }

  updateGroup(id: string, payload: UpdateGroupDto): Observable<Group> {
    return this.http.put<Group>(`${this.baseUrl}/${id}`, payload).pipe(
      tap((updated) => {
        this.groups.update((list) => list.map((g) => (g.id === id ? updated : g)));
      })
    );
  }

  deleteGroup(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => {
        this.groups.update((list) => list.filter((g) => g.id !== id));
      })
    );
  }

  updateGroupAgents(groupId: string, agentIds: string[]): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${groupId}/agents`, { agent_ids: agentIds });
  }
}