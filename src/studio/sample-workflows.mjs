export function createSampleWorkflowRecord(clock = () => new Date()) {
  const now = clock().toISOString();
  return {
    id: "sample-dry-run-search",
    name: "Dry-run search with approval",
    description: "A deterministic workflow that validates search, extraction, approval, and evidence capture.",
    workflow: {
      name: "dry-run-search-with-approval",
      version: "0.1.0",
      defaults: {
        timeoutMs: 3000,
        screenshot: "on-failure"
      },
      steps: [
        { id: "openSearch", action: "goto", url: "https://example.local/search" },
        { id: "fillQuery", action: "fill", selector: "#q", value: "{{input.query}}" },
        { id: "submitSearch", action: "click", selector: "#search" },
        { id: "waitResults", action: "waitFor", selector: ".result-title" },
        { id: "extractTitle", action: "extract", selector: ".result-title", name: "title" },
        {
          id: "reviewSearch",
          action: "approval",
          name: "reviewSearch",
          prompt: "Operator confirms the search result is safe to capture."
        },
        { id: "assertUseful", action: "assertText", selector: ".result-title", includes: "storage" },
        { id: "capture", action: "screenshot", name: "dry-run-search-result" }
      ]
    },
    defaultRun: {
      mode: "dry-run",
      input: {
        query: "storage case"
      },
      context: {
        accountName: "demo-operator",
        approvals: {
          reviewSearch: true
        }
      },
      driverConfig: {
        pages: {
          "https://example.local/search": {
            selectors: {
              "#q": { value: "" },
              "#search": { text: "Search" },
              ".result-title": { text: "Clear storage case supplier" }
            }
          }
        }
      }
    },
    createdAt: now,
    updatedAt: now
  };
}
