import { MessageAttachment, TaskPhase } from '../models/message.model';
import { TaskItem, TaskStatus } from '../models/task-chain.model';

export type SseParsedEvent =
  | { type: 'meta'; conversationId: string }
  | { type: 'attachments'; attachments: MessageAttachment[] }
  | { type: 'task_chain_init'; steps: TaskItem[]; callDepth?: number; agentId?: string }
  | { type: 'task_step_update'; stepNumber: number; status: TaskStatus; result?: string; callDepth?: number }
  | { type: 'text_chunk'; text: string }
  | { type: 'done' };

export class SseDecoder {
  /**
   * Extrahiert SSE data-Payloads aus einem Raw-Block.
   */
  static extractDataPayload(rawEvent: string): string | null {
    const lines = rawEvent.split('\n');
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5));
      } else if (line.trim() && !line.startsWith(':')) {
        dataLines.push(line);
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    return dataLines.join('\n');
  }

  /**
   * Parst den extrahierten Dateninhalt in ein typisiertes Domänen-Event.
   */
  static parseEvent(content: string): SseParsedEvent {
    if (content === '[DONE]') {
      return { type: 'done' };
    }

    // 1. Meta-Event Detection
    if (content.startsWith('{')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.type === 'meta' && parsed.data?.conversation_id) {
          return { type: 'meta', conversationId: parsed.data.conversation_id };
        }
      } catch {
        // Weitermachen falls kein valides JSON
      }
    }

    // 2. Attachments Event
    if (content.includes('__ATTACHMENTS__:')) {
      const jsonStart = content.indexOf('__ATTACHMENTS__:') + '__ATTACHMENTS__:'.length;
      try {
        const payload = JSON.parse(content.substring(jsonStart).trim());
        if (payload.type === 'attachments' && Array.isArray(payload.files)) {
          return { type: 'attachments', attachments: payload.files };
        }
      } catch (err) {
        console.error('Failed to parse SSE attachments:', err);
      }
    }

    // 3. Task Chain Events
    // 3. Task Chain Events
    if (content.includes('__TASK_CHAIN__:')) {
      const jsonStart = content.indexOf('__TASK_CHAIN__:') + '__TASK_CHAIN__:'.length;
      try {
        const payload = JSON.parse(content.substring(jsonStart).trim());
        if (payload.type === 'task_chain_init' && Array.isArray(payload.steps)) {
          const normalizedSteps: TaskItem[] = payload.steps.map((s: Record<string, unknown>) => ({
            step_number: (s['step_number'] ?? s['step']) as number,
            description: (s['description'] as string) ?? '',
            tool_name: (s['tool_name'] ?? s['tool']) as string | undefined,
            parameters: (s['parameters'] ?? s['params']) as Record<string, unknown> | undefined,
            status: (s['status'] as TaskStatus) ?? 'pending'
          }));

          return {
            type: 'task_chain_init',
            steps: normalizedSteps,
            callDepth: payload.call_depth ?? 0,
            agentId: payload.agent_id
          };
        }
        if (payload.type === 'task_step_update') {
          return {
            type: 'task_step_update',
            stepNumber: payload.step_number,
            status: payload.status,
            result: payload.result,
            callDepth: payload.call_depth ?? 0
          };
        }
      } catch (err) {
        console.error('Failed to parse SSE task chain:', err);
      }
    }

    return { type: 'text_chunk', text: content };
  }

  /**
   * Wendet Task Step Updates auf eine Liste von Phasen an (Immutabler Update).
   */
  static applyTaskStepUpdate(
    phases: TaskPhase[],
    stepNumber: number,
    status: TaskStatus,
    targetDepth: number = 0,
    result?: string | Record<string, unknown>
  ): TaskPhase[] {
    if (!phases || phases.length === 0) return [];

    return phases.map((phase) => {
      const phaseDepth = phase.callDepth ?? 0;
      
      const updatedSteps = phase.steps.map((step) => {
        // 1. Prüfen, ob dieser Step auf der aktuellen Ebene aktualisiert werden muss
        if (phaseDepth === targetDepth && step.step_number === stepNumber) {
          return {
            ...step,
            status,
            ...(result !== undefined ? { result } : {})
          };
        }

        // 2. Falls eine verschachtelte Sub-Task-Chain existiert, rekursiv durchreichen
        if (step.subTaskChain) {
          const updatedSubPhases = SseDecoder.applyTaskStepUpdate(
            [step.subTaskChain],
            stepNumber,
            status,
            targetDepth,
            result
          );

          return {
            ...step,
            subTaskChain: updatedSubPhases[0]
          };
        }

        return step;
      });

      return {
        ...phase,
        steps: updatedSteps
      };
    });
  }
}