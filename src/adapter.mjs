export function defineAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") throw new Error("Adapter must be an object");
  const id = cleanId(adapter.id);
  if (!id) throw new Error("Adapter id is required");
  return {
    id,
    name: adapter.name || id,
    version: adapter.version || "0.1.0",
    description: adapter.description || "",
    registry: normalizeRegistryPack(adapter.registry ?? {}),
    workflows: Array.isArray(adapter.workflows) ? adapter.workflows : [],
    fixtures: normalizeFixtures(adapter.fixtures ?? {}),
    policies: adapter.policies ?? {},
    metadata: adapter.metadata ?? {}
  };
}

export function createRegistryPack({ sites = [], pages = [], actions = [], operations = [] } = {}) {
  return normalizeRegistryPack({ sites, pages, actions, operations });
}

export function createFixtureDriverConfig(adapterInput, fixtureId = "default") {
  const adapter = defineAdapter(adapterInput);
  const fixture = adapter.fixtures[fixtureId];
  if (!fixture) throw new Error(`Fixture not found: ${fixtureId}`);
  return {
    pages: fixture.pages ?? {},
    apiResponses: fixture.apiResponses ?? {},
    initialUrl: fixture.initialUrl ?? "about:blank"
  };
}

export async function installAdapterToStore({ adapter: adapterInput, store }) {
  if (!store) throw new Error("installAdapterToStore requires a store");
  const adapter = defineAdapter(adapterInput);
  const current = await store.getRegistry();
  const registry = mergeRegistry(current, adapter.registry);
  await store.saveRegistry(registry);

  let workflows = 0;
  for (const workflow of adapter.workflows) {
    await store.saveWorkflow(workflow);
    workflows += 1;
  }

  return {
    adapter: {
      id: adapter.id,
      name: adapter.name,
      version: adapter.version
    },
    imported: {
      sites: adapter.registry.sites.length,
      pages: adapter.registry.pages.length,
      actions: adapter.registry.actions.length,
      operations: adapter.registry.operations.length,
      workflows
    }
  };
}

function normalizeRegistryPack(pack) {
  return {
    version: pack.version ?? "0.1.0",
    sites: normalizeArray(pack.sites),
    pages: normalizeArray(pack.pages),
    actions: normalizeArray(pack.actions),
    operations: normalizeArray(pack.operations)
  };
}

function normalizeFixtures(fixtures) {
  return Object.fromEntries(Object.entries(fixtures).map(([id, fixture]) => [
    cleanId(id),
    {
      pages: fixture?.pages ?? {},
      apiResponses: fixture?.apiResponses ?? {},
      initialUrl: fixture?.initialUrl ?? "about:blank",
      metadata: fixture?.metadata ?? {}
    }
  ]));
}

function normalizeArray(value) {
  return (Array.isArray(value) ? value : []).map((item) => ({ ...item }));
}

function mergeRegistry(current, incoming) {
  return {
    version: current.version ?? incoming.version ?? "0.1.0",
    sites: mergeById(current.sites, incoming.sites),
    pages: mergeById(current.pages, incoming.pages),
    actions: mergeById(current.actions, incoming.actions),
    operations: mergeById(current.operations, incoming.operations)
  };
}

function mergeById(current = [], incoming = []) {
  const map = new Map((Array.isArray(current) ? current : []).map((item) => [item.id, item]));
  for (const item of incoming) {
    if (!item?.id) continue;
    map.set(item.id, { ...map.get(item.id), ...item });
  }
  return Array.from(map.values());
}

function cleanId(value) {
  return String(value || "").trim();
}
