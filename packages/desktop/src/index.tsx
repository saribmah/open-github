/* @refresh reload */
import "@/index.css";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import { MetaProvider } from "@solidjs/meta";
import { Fonts, MarkedProvider } from "@open-github/ui";
import { SDKProvider } from "./context/sdk";
import { SyncProvider } from "./context/sync";
import { LocalProvider } from "./context/local";
import { SandboxProvider, useSandbox } from "./context/sandbox";
import Layout from "@/pages/layout";
import SessionLayout from "@/pages/session-layout";
import Session from "@/pages/session";
import { createSignal, Show, onMount } from "solid-js";

const root = document.getElementById("root");
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?",
  );
}

// Parse route to extract owner/repo
function parseRoute(): { owner?: string; repo?: string } {
  const path = window.location.pathname;
  const match = path.match(/^\/([^/]+)\/([^/]+)/);

  if (match) {
    return {
      owner: match[1],
      repo: match[2],
    };
  }

  return {};
}

// Component that manages sandbox URL
function App() {
  const { owner, repo } = parseRoute();

  return (
    <SandboxProvider owner={owner} repo={repo}>
      <SandboxRouter />
    </SandboxProvider>
  );
}

// Inner component that uses sandbox context
function SandboxRouter() {
  const sandbox = useSandbox();
  const [mounted, setMounted] = createSignal(false);
  const { owner, repo } = parseRoute();

  onMount(() => {
    setMounted(true);
  });

  // Fallback URL for local development (only when NOT using sandbox provisioning)
  const host = import.meta.env.VITE_OPENCODE_SERVER_HOST ?? "127.0.0.1";
  const port = import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096";
  const fallbackUrl = `http://${host}:${port}`;

  // Determine if we're using sandbox provisioning
  const usingSandbox = () => !!(owner && repo);

  // Use sandbox URL if ready, otherwise use fallback or query param
  const url = () => {
    const queryUrl = new URLSearchParams(window.location.search).get("url");
    if (queryUrl) return queryUrl;

    const sandboxUrl = sandbox.sandboxUrl();
    if (sandboxUrl) return sandboxUrl;

    // Only use fallback if NOT provisioning a sandbox
    if (import.meta.env.DEV && !usingSandbox()) return fallbackUrl;

    return null;
  };

  return (
    <Show
      when={mounted()}
      fallback={
        <div
          style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            height: "100vh",
            "font-family": "system-ui",
          }}
        >
          <div>Loading...</div>
        </div>
      }
    >
      <Show
        when={sandbox.status() !== "loading" && url()}
        fallback={
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              "align-items": "center",
              "justify-content": "center",
              height: "100vh",
              "font-family": "system-ui",
              gap: "1rem",
            }}
          >
            <div style={{ "font-size": "2rem" }}>🚀</div>
            <div style={{ "font-size": "1.2rem" }}>
              Preparing your sandbox...
            </div>
            <div style={{ color: "#666" }}>
              This usually takes 20-30 seconds
            </div>
          </div>
        }
      >
        <Show
          when={sandbox.status() !== "error"}
          fallback={
            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                "justify-content": "center",
                height: "100vh",
                "font-family": "system-ui",
                gap: "1rem",
              }}
            >
              <div style={{ "font-size": "2rem" }}>❌</div>
              <div style={{ "font-size": "1.2rem" }}>
                Failed to create sandbox
              </div>
              <div style={{ color: "#666" }}>{sandbox.error()}</div>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "0.5rem 1rem",
                  "border-radius": "4px",
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          }
        >
          <MarkedProvider>
            <SDKProvider url={url() || ""}>
              <SyncProvider>
                <LocalProvider>
                  <MetaProvider>
                    <Fonts />
                    <Router root={Layout}>
                      <Route path="/:owner/:repo" component={SessionLayout}>
                        <Route path="/session/:id?" component={Session} />
                        <Route path="/" component={Session} />
                      </Route>
                      <Route path={["/", "/session"]} component={SessionLayout}>
                        <Route path="/:id?" component={Session} />
                      </Route>
                    </Router>
                  </MetaProvider>
                </LocalProvider>
              </SyncProvider>
            </SDKProvider>
          </MarkedProvider>
        </Show>
      </Show>
    </Show>
  );
}

render(() => <App />, root!);
