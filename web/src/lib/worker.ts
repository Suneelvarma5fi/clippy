/**
 * Trigger a job on the Python worker.
 * The worker picks it up via BackgroundTasks and updates Supabase in real-time.
 */
export async function triggerJob(jobId: string): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    throw new Error("WORKER_URL and WORKER_SECRET must be set");
  }

  const res = await fetch(`${workerUrl}/jobs/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": workerSecret,
    },
    body: JSON.stringify({ job_id: jobId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Worker trigger failed (${res.status}): ${body}`);
  }
}
