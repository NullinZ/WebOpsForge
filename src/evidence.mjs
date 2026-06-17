import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function createMemoryEvidenceStore() {
  const records = [];
  const artifacts = new Map();
  return {
    async append(record) {
      records.push(normalizeRecord(record));
      return records.at(-1);
    },
    async putArtifact({ name, contentType = "application/octet-stream", bytes, text }) {
      const ref = `memory://${sanitizeName(name)}`;
      artifacts.set(ref, { name, contentType, bytes, text });
      return { ref, contentType, name };
    },
    list() {
      return records.slice();
    },
    artifacts() {
      return new Map(artifacts);
    }
  };
}

export function createFileEvidenceStore({ dir }) {
  if (!dir) throw new Error("createFileEvidenceStore requires dir");
  const evidenceFile = path.join(dir, "events.jsonl");
  const artifactsDir = path.join(dir, "artifacts");
  return {
    async append(record) {
      await mkdir(dir, { recursive: true });
      const normalized = normalizeRecord(record);
      await writeFile(evidenceFile, `${JSON.stringify(normalized)}\n`, { flag: "a" });
      return normalized;
    },
    async putArtifact({ name, contentType = "application/octet-stream", bytes, text }) {
      await mkdir(artifactsDir, { recursive: true });
      const fileName = sanitizeName(name);
      const filePath = path.join(artifactsDir, fileName);
      await writeFile(filePath, bytes ?? text ?? "");
      return { ref: filePath, contentType, name: fileName };
    }
  };
}

export function normalizeRecord(record) {
  return {
    createdAt: new Date().toISOString(),
    ...record
  };
}

function sanitizeName(name) {
  return String(name || "artifact")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || "artifact";
}
