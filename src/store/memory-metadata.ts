import { randomUUID } from 'node:crypto';

const MEMORY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DecodedMemoryMetadata {
  text: string;
  created: string;
  lastReferenced: string;
  project: string | null;
  memoryId: string | null;
}

export function isMemoryId(value: string): boolean {
  return MEMORY_ID_PATTERN.test(value);
}

export function createMemoryId(): string {
  return randomUUID();
}

export function parseMemoryMetadata(raw: string): DecodedMemoryMetadata {
  const match = raw.match(/^(.*?)\s*<!--\s*(?:memory_id=([^,\s]+),\s*)?created=([^,]+),\s*last=([^,>]+)(?:,\s*project64=([A-Za-z0-9_-]+))?\s*-->\s*$/);
  if (match) {
    let project: string | null = null;
    if (match[5]) {
      try { project = Buffer.from(match[5], 'base64url').toString('utf-8').trim() || null; } catch {}
    }
    return {
      text: match[1].trim(),
      created: match[3].trim(),
      lastReferenced: match[4].trim(),
      project,
      memoryId: match[2] && isMemoryId(match[2]) ? match[2].toLowerCase() : null,
    };
  }

  const today = new Date().toISOString().split('T')[0];
  return {
    text: raw.trim(),
    created: today,
    lastReferenced: today,
    project: null,
    memoryId: null,
  };
}

export function encodeMemoryMetadata(
  text: string,
  created: string,
  lastReferenced: string,
  project?: string | null,
  memoryId = createMemoryId(),
): string {
  const projectMetadata = project?.trim()
    ? `, project64=${Buffer.from(project.trim(), 'utf-8').toString('base64url')}`
    : '';
  return `${text.trim()} <!-- memory_id=${memoryId}, created=${created}, last=${lastReferenced}${projectMetadata} -->`;
}

export function stripMemoryMetadata(raw: string): string {
  return parseMemoryMetadata(raw).text;
}

export function ensureMemoryEntryIds(rawEntries: readonly string[]): { entries: string[]; changed: boolean } {
  const usedIds = new Set<string>();
  let changed = false;
  const entries = rawEntries.map((rawEntry) => {
    const decoded = parseMemoryMetadata(rawEntry);
    const memoryId = decoded.memoryId && !usedIds.has(decoded.memoryId)
      ? decoded.memoryId
      : createMemoryId();
    usedIds.add(memoryId);
    const encoded = encodeMemoryMetadata(
      decoded.text,
      decoded.created,
      decoded.lastReferenced,
      decoded.project,
      memoryId,
    );
    if (encoded !== rawEntry.trim()) changed = true;
    return encoded;
  });
  return { entries, changed };
}
