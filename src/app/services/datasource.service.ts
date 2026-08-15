import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Service managing agent datasource operations.
 */
@Injectable({
  providedIn: 'root'
})
export class DatasourceService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/v1/agents';

  /**
   * Deletes a datasource bound to an agent.
   *
   * @param agentId - Unique identifier of the agent.
   * @param datasourceId - Unique identifier of the datasource file.
   * @returns Observable emitting upon successful deletion.
   */
  deleteDatasource(agentId: string, datasourceId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${agentId}/datasources/${datasourceId}`);
  }
}
