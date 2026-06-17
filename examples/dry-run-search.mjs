import {
  WebOpsRunner,
  createDryRunDriver,
  createMemoryEvidenceStore,
  defineWorkflow
} from "../src/index.mjs";

const workflow = defineWorkflow({
  name: "dry-run-search",
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
    { id: "assertUseful", action: "assertText", selector: ".result-title", includes: "storage" },
    { id: "capture", action: "screenshot", name: "dry-run-search-result" }
  ]
});

const driver = createDryRunDriver({
  pages: {
    "https://example.local/search": {
      selectors: {
        "#q": { value: "" },
        "#search": { text: "Search" },
        ".result-title": { text: "Clear storage case supplier" }
      }
    }
  }
});

const evidenceStore = createMemoryEvidenceStore();
const runner = new WebOpsRunner({ driver, evidenceStore });
const result = await runner.run(workflow, { input: { query: "storage case" } });

console.log(JSON.stringify({
  status: result.status,
  title: result.outputs.title,
  evidenceCount: evidenceStore.list().length,
  driverActions: driver.log.map((item) => item.action)
}, null, 2));
