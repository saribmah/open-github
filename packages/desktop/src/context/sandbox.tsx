import {
  createContext,
  useContext,
  createSignal,
  onMount,
  ParentComponent,
} from "solid-js";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

export type SandboxStatus = "idle" | "loading" | "ready" | "error";

// Get or create browser fingerprint
async function getBrowserFingerprint(): Promise<string> {
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
  } catch (error) {
    console.error("Failed to generate fingerprint:", error);
    // Fallback to a random ID stored in localStorage
    let fallbackId = localStorage.getItem("opencode-user-id");
    if (!fallbackId) {
      fallbackId = `user-${Math.random().toString(36).substring(2, 15)}`;
      localStorage.setItem("opencode-user-id", fallbackId);
    }
    return fallbackId;
  }
}

interface SandboxContextType {
  sandboxUrl: () => string | null;
  status: () => SandboxStatus;
  error: () => string | null;
  sessionId: () => string | null;
  requestSandbox: (
    owner: string,
    repo: string,
    branch?: string,
  ) => Promise<void>;
}

const SandboxContext = createContext<SandboxContextType>();

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface SandboxProviderProps {
  owner?: string;
  repo?: string;
}

export const SandboxProvider: ParentComponent<SandboxProviderProps> = (
  props,
) => {
  const [sandboxUrl, setSandboxUrl] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<SandboxStatus>("idle");
  const [error, setError] = createSignal<string | null>(null);
  const [sessionId, setSessionId] = createSignal<string | null>(null);

  const requestSandbox = async (
    owner: string,
    repo: string,
    branch?: string,
  ) => {
    setStatus("loading");
    setError(null);

    try {
      console.log(
        `🚀 Requesting sandbox for ${owner}/${repo}${branch ? `@${branch}` : ""}`,
      );

      // Get browser fingerprint for user identification
      const userId = await getBrowserFingerprint();
      console.log(`  👤 User ID: ${userId}`);

      // Create sandbox
      const createResponse = await fetch(`${API_URL}/api/sandbox/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ owner, repo, branch, userId }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.message || "Failed to create sandbox");
      }

      const createData = await createResponse.json();
      setSessionId(createData.sessionId);

      console.log(`  ✅ Session created: ${createData.sessionId}`);

      // If sandbox is already ready (reused)
      if (createData.status === "ready" && createData.url) {
        console.log(`  ♻️  Using existing sandbox: ${createData.url}`);
        setSandboxUrl(createData.url);
        setStatus("ready");
        return;
      }

      // Poll for sandbox status
      console.log(`  ⏳ Waiting for sandbox to be ready...`);
      await pollSandboxStatus(createData.sessionId);
    } catch (err) {
      console.error("❌ Failed to request sandbox:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const pollSandboxStatus = async (sessionId: string, maxAttempts = 60) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const statusResponse = await fetch(
          `${API_URL}/api/sandbox/${sessionId}`,
        );

        if (!statusResponse.ok) {
          throw new Error("Failed to get sandbox status");
        }

        const statusData = await statusResponse.json();

        if (statusData.status === "ready" && statusData.url) {
          console.log(`  ✅ Sandbox ready: ${statusData.url}`);
          setSandboxUrl(statusData.url);
          setStatus("ready");
          return;
        }

        if (statusData.status === "error") {
          throw new Error(statusData.error || "Sandbox failed to provision");
        }

        // Still provisioning, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (err) {
        throw err;
      }
    }

    throw new Error("Sandbox provisioning timed out");
  };

  // Auto-request sandbox if owner/repo provided
  onMount(() => {
    if (props.owner && props.repo) {
      requestSandbox(props.owner, props.repo);
    }
  });

  const value: SandboxContextType = {
    sandboxUrl,
    status,
    error,
    sessionId,
    requestSandbox,
  };

  return (
    <SandboxContext.Provider value={value}>
      {props.children}
    </SandboxContext.Provider>
  );
};

export const useSandbox = () => {
  const context = useContext(SandboxContext);
  if (!context) {
    throw new Error("useSandbox must be used within a SandboxProvider");
  }
  return context;
};
