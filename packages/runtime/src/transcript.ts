/**
 * Transcript capture and logging
 */

import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import type { Transcript, TranscriptEntry, AgentConfig } from '@eitherway/tools-core';

export class TranscriptRecorder {
  private currentTranscript: Transcript | null = null;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Start a new transcript
   */
  startTranscript(request: string): string {
    const id = this.generateId();
    const startTime = new Date().toISOString();

    this.currentTranscript = {
      id,
      startTime,
      entries: [],
      request
    };

    this.log('info', `Started transcript ${id}`);
    return id;
  }

  /**
   * Add an entry to the current transcript
   */
  addEntry(entry: TranscriptEntry): void {
    if (!this.currentTranscript) {
      this.log('warn', 'Attempted to add entry without active transcript');
      return;
    }

    this.currentTranscript.entries.push(entry);
  }

  /**
   * End the current transcript
   */
  endTranscript(id: string, result?: string): void {
    if (!this.currentTranscript || this.currentTranscript.id !== id) {
      this.log('warn', `Transcript ${id} not found or mismatch`);
      return;
    }

    this.currentTranscript.endTime = new Date().toISOString();
    this.currentTranscript.result = result;

    this.log('info', `Ended transcript ${id}`);
  }

  async saveCurrentTranscript(): Promise<void> {
    if (!this.currentTranscript) {
      return;
    }

    if (!this.config.logging.captureTranscripts) {
      return;
    }

    try {
      const dir = this.config.logging.transcriptDir;
      await mkdir(dir, { recursive: true });

      const filename = `transcript-${this.currentTranscript.id}.json`;
      const filepath = resolve(dir, filename);

      await writeFile(
        filepath,
        JSON.stringify(this.currentTranscript, null, 2),
        'utf-8'
      );

      this.log('info', `Saved transcript to ${filepath}`);
    } catch (error: any) {
      this.log('error', `Failed to save transcript: ${error.message}`);
    }
  }

  getCurrentTranscript(): Transcript | null {
    return this.currentTranscript ? { ...this.currentTranscript } : null;
  }

  /**
   * Log a message
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[this.config.logging.level];
    const messageLevel = levels[level];

    if (messageLevel >= configLevel) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

      if (level === 'error') {
        console.error(logMessage);
      } else {
        console.log(logMessage);
      }
    }
  }

  /**
   * Generate unique ID for transcript
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `${timestamp}-${random}`;
  }
}
