export function createSampleWorkflowRecord(clock = () => new Date()) {
  const now = clock().toISOString();
  return {
    id: "sample-dry-run-search",
    name: "Search operation with UI/API switch",
    description: "A deterministic workflow that can execute the same search operation through browser steps or an API call.",
    workflow: {
      name: "dry-run-search-with-approval",
      version: "0.1.0",
      defaults: {
        timeoutMs: 3000,
        screenshot: "on-failure"
      },
      steps: [
        {
          id: "searchSuppliers",
          action: "operation",
          mode: "{{context.operationModes.searchSuppliers}}",
          browserSteps: [
            { id: "openSearch", action: "goto", url: "https://example.local/search" },
            { id: "fillQuery", action: "fill", selector: "#q", value: "{{input.query}}" },
            { id: "submitSearch", action: "click", selector: "#search" },
            { id: "waitResults", action: "waitFor", selector: ".result-title" },
            { id: "extractTitle", action: "extract", selector: ".result-title", name: "title" }
          ],
          api: {
            method: "GET",
            url: "https://api.example.local/suppliers/search",
            query: { q: "{{input.query}}" },
            extract: "json.title",
            name: "title"
          }
        },
        {
          id: "reviewSearch",
          action: "approval",
          name: "reviewSearch",
          prompt: "Operator confirms the search result is safe to capture."
        },
        { id: "assertUseful", action: "assertOutput", name: "title", includes: "storage" },
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
        operationModes: {
          searchSuppliers: "browser"
        },
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
        },
        apiResponses: {
          "GET https://api.example.local/suppliers/search?q=storage+case": {
            json: {
              title: "Clear storage case supplier"
            }
          }
        }
      }
    },
    createdAt: now,
    updatedAt: now
  };
}
