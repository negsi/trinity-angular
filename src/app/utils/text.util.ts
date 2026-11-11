/**
 * Utility functions for processing markdown and clipboard text.
 */

/**
 * Strips markdown markup syntax from a string to produce clean plain text.
 *
 * @param markdownText - Text with markdown formatting.
 * @returns Clean plain text.
 */
export function stripMarkdown(markdownText?: string | null): string {
  if (!markdownText) {
    return '';
  }

  return markdownText
    .replace(/```[\s\S]*?```/g, (match) =>
      match.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')
    )
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, '$2')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^[\s\u00A0]*([*\-+]|\d+\.)[\s\u00A0]*/, '')
        .replace(/^[\s\u00A0]*>[\s\u00A0]*/, '')
        .replace(/^#{1,6}\s+/, '')
        .trim()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

import { SafeHtml } from '@angular/platform-browser';
// Falls du marked oder einen DomSanitizer nutzt, hier entsprechend importieren.
// Beispiel, falls du eine einfache Formatierung oder Marked verwendest:

/**
 * Formats raw LLM message content into safe HTML.
 * 
 * @param rawText - Raw text or markdown from the model.
 * @returns Safe HTML string ready for [innerHTML].
 */
export function formatMessageContent(rawText?: string | null): string {
  if (!rawText) {
    return '';
  }
  // Hier kannst du deine bestehende Markdown-Logik einbinden 
  // (z.B. mit marked.parse(rawText) oder ähnlich)
  return rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}