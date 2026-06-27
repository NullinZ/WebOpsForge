export const DEFAULT_PROXY_BYPASS = "127.0.0.1,::1,localhost";

const PROXY_MODES = new Set(["system", "direct", "custom"]);

export function normalizeProfileNetwork(record = {}, existing = {}) {
  const source = record?.network ?? {};
  const existingSource = existing?.network ?? {};
  const proxyMode = normalizeProxyMode(
    source.proxyMode
      ?? record?.proxyMode
      ?? existingSource.proxyMode
      ?? existing?.proxyMode
      ?? "system"
  );
  return {
    proxyMode,
    proxyServer: proxyMode === "custom"
      ? normalizeProxyServer(source.proxyServer ?? record?.proxyServer ?? existingSource.proxyServer ?? existing?.proxyServer ?? "")
      : "",
    proxyBypass: normalizeProxyBypass(source.proxyBypass ?? record?.proxyBypass ?? existingSource.proxyBypass ?? existing?.proxyBypass ?? DEFAULT_PROXY_BYPASS)
  };
}

export function applyProfileNetworkToLaunchOptions(launchOptions = {}, network = {}) {
  const normalized = normalizeProfileNetwork({ network });
  const next = { ...launchOptions };
  next.args = cleanProxyArgs(Array.isArray(next.args) ? next.args : []);
  delete next.proxy;

  if (normalized.proxyMode === "direct") {
    next.args.push("--no-proxy-server");
  } else if (normalized.proxyMode === "custom" && normalized.proxyServer) {
    next.proxy = {
      server: normalized.proxyServer,
      ...(normalized.proxyBypass ? { bypass: normalized.proxyBypass } : {})
    };
    next.args.push(`--proxy-server=${normalized.proxyServer}`);
    if (normalized.proxyBypass) next.args.push(`--proxy-bypass-list=${normalized.proxyBypass}`);
  }

  if (!next.args.length) delete next.args;
  return next;
}

export function profileNetworkArgs(network = {}) {
  const normalized = normalizeProfileNetwork({ network });
  if (normalized.proxyMode === "direct") return ["--no-proxy-server"];
  if (normalized.proxyMode !== "custom" || !normalized.proxyServer) return [];
  return [
    `--proxy-server=${normalized.proxyServer}`,
    ...(normalized.proxyBypass ? [`--proxy-bypass-list=${normalized.proxyBypass}`] : [])
  ];
}

function normalizeProxyMode(value) {
  const mode = String(value ?? "").trim().toLowerCase();
  return PROXY_MODES.has(mode) ? mode : "system";
}

function normalizeProxyServer(value) {
  const server = String(value ?? "").trim();
  if (!server) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(server)) return server;
  return `http://${server}`;
}

function normalizeProxyBypass(value) {
  return String(value ?? "").trim() || DEFAULT_PROXY_BYPASS;
}

function cleanProxyArgs(args) {
  return args.filter((arg) => {
    const text = String(arg);
    return text !== "--no-proxy-server"
      && !text.startsWith("--proxy-server=")
      && !text.startsWith("--proxy-bypass-list=");
  });
}
