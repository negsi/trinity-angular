// schedule.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ScheduleEntity, UpsertScheduleDto, ScheduleExecutionEntity } from '../models/schedule.model';

@Injectable({
  providedIn: 'root'
})
export class ScheduleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1';

  /** Fetch all schedules configured for a specific agent */
  getAgentSchedules(agentId: string): Observable<ScheduleEntity[]> {
    return this.http.get<ScheduleEntity[]>(`${this.baseUrl}/agents/${agentId}/schedules`);
  }

  /** Create a new schedule for an agent */
  createSchedule(agentId: string, dto: UpsertScheduleDto): Observable<ScheduleEntity> {
    return this.http.post<ScheduleEntity>(`${this.baseUrl}/agents/${agentId}/schedules`, dto);
  }

  /** Update an existing schedule for an agent */
  updateSchedule(agentId: string, scheduleId: string, dto: UpsertScheduleDto): Observable<ScheduleEntity> {
    return this.http.put<ScheduleEntity>(`${this.baseUrl}/agents/${agentId}/schedules/${scheduleId}`, dto);
  }

  /** Delete a schedule */
  deleteSchedule(scheduleId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/schedules/${scheduleId}`);
  }

  /** Trigger an immediate manual test execution ('Run Now') */
  runScheduleNow(scheduleId: string): Observable<ScheduleExecutionEntity> {
    return this.http.post<ScheduleExecutionEntity>(`${this.baseUrl}/schedules/${scheduleId}/run`, {});
  }

  /** Fetch execution history for a schedule */
  getScheduleExecutions(scheduleId: string): Observable<ScheduleExecutionEntity[]> {
    return this.http.get<ScheduleExecutionEntity[]>(`${this.baseUrl}/schedules/${scheduleId}/executions`);
  }
}