import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Datasource {
  id: string;
  name: string;
  size: string;             // z. B. "1.2 MB" (aufbereitet für die UI)
  type: 'pdf' | 'xls' | 'doc' | string; // Deine UI-Typen + Fallback
  
  // Optionale Felder, die vom Backend kommen können
  filename?: string;
  file_size?: number;       // In Bytes
  mime_type?: string;
  agent_id?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DatasourceService {
  private http = inject(HttpClient);
  private apiUrl = '/api/v1/agents'; // Passe die Basis-URL ggf. an deinen Endpoint an

  deleteDatasource(agentId: string, datasourceId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${agentId}/datasources/${datasourceId}`);
  }
}