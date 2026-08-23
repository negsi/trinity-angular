import { MessageAttachment, TaskPhase } from '../models/message.model';
import { TaskItem, TaskStatus } from '../models/task-chain.model';

export type SseParsedEvent =
  | { type: 'meta'; conversationId: string }
  | { type: 'attachments'; attachments: MessageAttachment[] }
  | { type: 'task_chain_init'; steps: TaskItem[] }
  | { type: 'task_step_update'; stepNumber: number; status: TaskStatus }
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
    if (content.includes('__TASK_CHAIN__:')) {
      const jsonStart = content.indexOf('__TASK_CHAIN__:') + '__TASK_CHAIN__:'.length;
      try {
        const payload = JSON.parse(content.substring(jsonStart).trim());
        if (payload.type === 'task_chain_init' && Array.isArray(payload.steps)) {
          return { type: 'task_chain_init', steps: payload.steps };
        }
        if (payload.type === 'task_step_update') {
          return {
            type: 'task_step_update',
            stepNumber: payload.step_number,
            status: payload.status
          };
        }
      } catch (err) {
        console.error('Failed to parse SSE task chain:', err);
      }
    }

    // 4. Plain Text Chunk
    return { type: 'text_chunk', text: content };
  }

  /**
   * Wendet Task Step Updates auf eine Liste von Phasen an (Immutabler Update).
   */
  static applyTaskStepUpdate(
    phases: TaskPhase[],
    stepNumber: number,
    status: TaskStatus
  ): TaskPhase[] {
    if (!phases || phases.length === 0) return [];

    const lastIdx = phases.length - 1;
    const currentPhase = phases[lastIdx];

    const updatedSteps = currentPhase.steps.map((step) =>
      step.step_number === stepNumber ? { ...step, status } : step
    );

    const updatedPhases = [...phases];
    updatedPhases[lastIdx] = { ...currentPhase, steps: updatedSteps };
    return updatedPhases;
  }
}
