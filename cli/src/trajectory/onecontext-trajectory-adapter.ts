import * as fs from 'fs';
import * as path from 'path';

/**
 * OneContextTrajectoryAdapter (Berserk Iteration 5)
 * Initial skeleton for trajectory capture.
 * Hooks into run-agent-step events and writes normalized JSONL.
 */
export class OneContextTrajectoryAdapter {
  private readonly stream: fs.WriteStream;

  constructor(outputDir: string, runId: string) {
    const filePath = path.join(outputDir, `${runId}.jsonl`);
    fs.mkdirSync(outputDir, { recursive: true });
    this.stream = fs.createWriteStream(filePath, { flags: 'a' });
  }

  /**
   * Hook entry point for run-agent-step events.
   */
  onRunAgentStep(stepEvent: unknown): void {
    const normalized = this.normalize(stepEvent);
    this.writeJSONL(normalized);
  }

  private normalize(raw: unknown): Record<string, unknown> {
    return {
      type: 'agent-step',
      timestamp: new Date().toISOString(),
      data: raw,
    };
  }

  private writeJSONL(event: Record<string, unknown>): void {
    this.stream.write(JSON.stringify(event) + '\n');
  }

  close(): void {
    this.stream.end();
  }
}
