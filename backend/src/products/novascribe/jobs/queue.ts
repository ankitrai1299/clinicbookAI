// Minimal in-process job queue — runs the heavy STT + AI pipeline OFF the HTTP
// request cycle (so uploading audio returns immediately and the doctor polls for
// status). Concurrency-limited so N consultations don't hammer the LLM/STT at
// once. Jobs are fire-and-forget and isolated: a throwing job is logged, never
// crashes the process.
//
// This is the LOCAL implementation. In production swap this single module for a
// Redis-backed BullMQ queue (durable across restarts, multi-worker) — callers
// that do `enqueue(...)` do not change.

type Task = () => Promise<void>;

const MAX_CONCURRENCY = Number(process.env.NOVASCRIBE_JOB_CONCURRENCY ?? 2);

class InProcessQueue {
  private running = 0;
  private readonly pending: Array<{ label: string; task: Task }> = [];

  /** Schedule a task. Returns immediately; the task runs in the background. */
  enqueue(label: string, task: Task): void {
    this.pending.push({ label, task });
    this.pump();
  }

  private pump(): void {
    while (this.running < MAX_CONCURRENCY && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) {
        break;
      }
      this.running += 1;
      void this.run(job.label, job.task);
    }
  }

  private async run(label: string, task: Task): Promise<void> {
    try {
      await task();
    } catch (err) {
      console.error(`[novascribe.jobs] job "${label}" failed:`, err);
    } finally {
      this.running -= 1;
      this.pump();
    }
  }
}

export const novascribeQueue = new InProcessQueue();
