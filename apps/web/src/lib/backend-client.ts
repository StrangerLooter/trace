/**
 * Shared client for consented requests to the isolated FastAPI sandbox.
 * Handles free-tier container cold starts cleanly with wake pings and transient retries.
 */

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export async function warmBackendHealth(): Promise<void> {
  if (process.env.NEXT_PUBLIC_ENABLE_BACKEND_ESCALATION !== "true") {
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`${getApiBaseUrl()}/api/v1/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    // Non-blocking best-effort wake ping for sleeping free-tier instances
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBackendWithWakeRetry(
  path: string,
  init: RequestInit,
  onStatus?: (message: string) => void
): Promise<Response> {
  const url = `${getApiBaseUrl()}${path}`;
  const slowTimer = setTimeout(() => {
    onStatus?.("Waking free-tier sandbox container (~20–50s if idle)…");
  }, 2500);

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(url, init);
        if ((resp.status === 502 || resp.status === 503 || resp.status === 504) && attempt < 2) {
          onStatus?.("Sandbox container is starting up—retrying automatically…");
          await new Promise((resolve) => setTimeout(resolve, 3500 * (attempt + 1)));
          continue;
        }
        return resp;
      } catch (err) {
        if (attempt < 2) {
          onStatus?.("Waiting for sandbox container to wake—retrying…");
          await new Promise((resolve) => setTimeout(resolve, 3500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Backend request failed after retries");
  } finally {
    clearTimeout(slowTimer);
  }
}
