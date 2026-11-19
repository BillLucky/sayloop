// Search remains in memory; neither private queries nor material text enter URLs or storage.
const searchCache = new WeakMap();

export const normalizeSearch = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

export function readyRecordings(jobs) {
  const ready = new Map();
  for (const job of jobs) {
    if (job.kind === 'full' && job.status === 'completed' && !ready.has(job.material_id)) {
      ready.set(job.material_id, job);
    }
  }
  return ready;
}

function searchableText(material) {
  const tags = (material.tags || []).join(' ');
  const cached = searchCache.get(material);
  if (cached?.title === material.title && cached.text === material.text && cached.tags === tags) {
    return cached.value;
  }
  const value = normalizeSearch(`${material.title} ${material.text} ${tags}`);
  searchCache.set(material, { title: material.title, text: material.text, tags, value });
  return value;
}

export function hasLibraryFilters(filters) {
  return Boolean(
    normalizeSearch(filters.query) ||
      filters.language ||
      filters.kind ||
      filters.scope ||
      (filters.status && filters.status !== 'all') ||
      (filters.sort && filters.sort !== 'new')
  );
}

export function matchingMaterials(materials, ready, filters) {
  const terms = normalizeSearch(filters.query).split(' ').filter(Boolean);
  return materials
    .filter((material) => {
      if (Boolean(material.archived) !== (filters.scope === 'archived')) return false;
      if (filters.language && material.language !== filters.language) return false;
      if (filters.kind === 'dialogue' && !material.turns?.length) return false;
      if (filters.kind === 'text' && material.turns?.length) return false;
      if (filters.scope === 'mine' && !material.owned) return false;
      if (filters.scope === 'shared' && material.visibility !== 'shared') return false;
      if (filters.scope === 'favorite' && !material.favorite) return false;
      if (filters.status === 'ready' && !ready.has(material.id)) return false;
      if (filters.status === 'draft' && ready.has(material.id)) return false;
      return terms.every((term) => searchableText(material).includes(term));
    })
    .sort((a, b) =>
      filters.sort === 'title'
        ? a.title.localeCompare(b.title)
        : (b.created_at || '').localeCompare(a.created_at || '')
    );
}
