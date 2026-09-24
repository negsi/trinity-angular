// Comments in English as requested
import { MessageAttachment, TaskPhase } from '../models/message.model';
import { TaskItem, TaskStatus } from '../models/task-chain.model';


export type SseParsedEvent =
  | { type: 'meta'; conversationId: string }
  | { type: 'attachments'; attachments: MessageAttachment[] }
  | { type: 'task_chain_init'; steps: TaskItem[]; callDepth?: number; agentId?: string }
  | { type: 'task_step_update'; stepNumber: number; status: TaskStatus; result?: string; callDepth?: number }
  | { type: 'thought'; thought: string; content?: string } 
  | { type: 'text_chunk'; text: string }
  | { type: 'done' };

export class SseDecoder {
  /**
   * Extracts SSE data payloads from a raw block.
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
   * Helper to match both raw ("__KEY__:") and markdown-stripped ("KEY:") prefixes.
   */
  private static findPrefixIndex(str: string, key: string): { index: number; length: number } | null {
    const rawPrefix = `__${key}__:`;
    const plainPrefix = `${key}:`;

    const rawIdx = str.indexOf(rawPrefix);
    if (rawIdx !== -1) return { index: rawIdx, length: rawPrefix.length };

    const plainIdx = str.indexOf(plainPrefix);
    if (plainIdx !== -1) return { index: plainIdx, length: plainPrefix.length };

    return null;
  }

  /**
   * Inspects a plain text string for embedded custom protocol payloads (__TASK_CHAIN__, __THOUGHT__, etc.)
   */
  private static parseSpecialStringPayload(str: string): SseParsedEvent | null {
    // 1. Task Chain Events
    const taskChainMatch = SseDecoder.findPrefixIndex(str, 'TASK_CHAIN');
    if (taskChainMatch) {
      const jsonStart = taskChainMatch.index + taskChainMatch.length;
      try {
        const jsonStr = str.substring(jsonStart).trim();
        const payload = JSON.parse(jsonStr);

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
        console.error('Failed to parse embedded SSE task chain JSON:', err, str);
      }

      // Suppress outputting raw protocol string to chat UI text
      return { type: 'text_chunk', text: '' };
    }

    // 2. Attachments Event
    const attachmentsMatch = SseDecoder.findPrefixIndex(str, 'ATTACHMENTS');
    if (attachmentsMatch) {
      const jsonStart = attachmentsMatch.index + attachmentsMatch.length;
      try {
        const payload = JSON.parse(str.substring(jsonStart).trim());
        if (payload.type === 'attachments' && Array.isArray(payload.files)) {
          return { type: 'attachments', attachments: payload.files };
        }
      } catch (err) {
        console.error('Failed to parse SSE attachments:', err);
      }
      return { type: 'text_chunk', text: '' };
    }

    // 3. Thought Event Detection
    const thoughtMatch = SseDecoder.findPrefixIndex(str, 'THOUGHT');
    if (thoughtMatch) {
      const jsonStart = thoughtMatch.index + thoughtMatch.length;
      try {
        const payload = JSON.parse(str.substring(jsonStart).trim());
        return { type: 'thought', thought: payload.delta || payload.content || payload.thought || payload.text || '' };
      } catch {
        return { type: 'thought', thought: str.substring(jsonStart).trim() };
      }
    }

    return null;
  }

  /**
   * Parses the extracted data content into a typed domain event.
   */
  static parseEvent(content: string): SseParsedEvent {
    if (content === '[DONE]') {
      return { type: 'done' };
    }

    // 1. Direct JSON Envelope Parsing (handles JSON SSE frames)
    if (content.startsWith('{')) {
      try {
        const parsed = JSON.parse(content);

        // Thought stream: {"type": "thought", "content": "...", "delta": "..."}
        if (parsed.type === 'thought') {
          return { type: 'thought', thought: parsed.delta ?? parsed.content ?? parsed.thought ?? '' };
        }

        // Standard text chunk or embedded protocol message: {"type": "content", "delta": "..."}
        if (parsed.type === 'content') {
          const rawText = parsed.delta ?? parsed.content ?? '';

          // Check if the content text itself contains embedded task chain or protocol commands
          const embeddedEvent = SseDecoder.parseSpecialStringPayload(rawText);
          if (embeddedEvent) {
            return embeddedEvent;
          }

          return { type: 'text_chunk', text: rawText };
        }

        // Meta event: {"type": "meta", "data": {"conversation_id": "..."}}
        if (parsed.type === 'meta' && parsed.data?.conversation_id) {
          return { type: 'meta', conversationId: parsed.data.conversation_id };
        }
      } catch {
        // Fallback to plain string pattern matching
      }
    }

    // 2. Direct Raw String Parsing (if SSE payload wasn't a JSON object)
    const directEvent = SseDecoder.parseSpecialStringPayload(content);
    if (directEvent) {
      return directEvent;
    }

    return { type: 'text_chunk', text: content };
  }

  /**
   * Cleans embedded __THOUGHT__: protocol strings from step results if needed.
   */
  static cleanStepResult(result: string | Record<string, unknown> | undefined): string | Record<string, unknown> | undefined {
    if (typeof result !== 'string') return result;

    if (result.includes('__THOUGHT__:')) {
      // Remove __THOUGHT__:{"content": "..."} prefix pattern
      return result.replace(/__THOUGHT__:\s*\{.*?\}\s*/gs, '').trim();
    }

    return result;
  }

  /**
   * Applies task step updates to a list of phases (Immutable update).
   */
  static applyTaskStepUpdate(
    phases: TaskPhase[],
    stepNumber: number,
    status: TaskStatus,
    targetDepth: number = 0,
    result?: string | Record<string, unknown>
  ): TaskPhase[] {
    if (!phases || phases.length === 0) return [];

    const cleanedResult = SseDecoder.cleanStepResult(result);

    return phases.map((phase) => {
      const phaseDepth = phase.callDepth ?? 0;

      const updatedSteps = phase.steps.map((step) => {
        if (phaseDepth === targetDepth && step.step_number === stepNumber) {
          return {
            ...step,
            status,
            ...(cleanedResult !== undefined ? { result: cleanedResult } : {})
          };
        }

        if (step.subTaskChain) {
          const updatedSubPhases = SseDecoder.applyTaskStepUpdate(
            [step.subTaskChain],
            stepNumber,
            status,
            targetDepth,
            cleanedResult
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