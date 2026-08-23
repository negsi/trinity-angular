import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DatasourceUploadResponse } from '../models/datasource.model';

/**
 * Service managing all agent datasource file operations.
 */
@Injectable({
  providedIn: 'root'
})
export class DatasourceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/agents';

  /**
   * Uploads a file datasource for a specific agent.
   *
   * @param agentId - The agent ID to attach the file to.
   * @param file - The file to upload.
   * @returns Observable emitting the uploaded datasource metadata.
   */
  uploadDatasource(agentId: string, file: File): Observable<DatasourceUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name);

    return this.http.post<DatasourceUploadResponse>(
      `${this.baseUrl}/${agentId}/datasources`,
      formData
    );
  }

  /**
   * Deletes a datasource bound to an agent.
   *
   * @param agentId - Unique identifier of the agent.
   * @param datasourceId - Unique identifier of the datasource file.
   * @returns Observable emitting upon successful deletion.
   */
  deleteDatasource(agentId: string, datasourceId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${agentId}/datasources/${datasourceId}`);
  }
}