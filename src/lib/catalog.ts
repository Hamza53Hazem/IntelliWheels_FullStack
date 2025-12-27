import { MOCK_CARS } from './mockData';

interface CatalogModel {
  name: string;
  engines: Set<string>;
}

interface CatalogMake {
  name: string;
  models: Record<string, CatalogModel>;
}

const catalogIndex: Record<string, CatalogMake> = buildCatalogIndex();

function buildCatalogIndex() {
  const index: Record<string, CatalogMake> = {};
  for (const car of MOCK_CARS) {
    const makeName = car.make?.trim();
    const modelName = car.model?.trim();
    if (!makeName || !modelName) continue;
    const makeKey = makeName.toLowerCase();
    if (!index[makeKey]) {
      index[makeKey] = { name: makeName, models: {} };
    }
    const modelKey = modelName.toLowerCase();
    if (!index[makeKey].models[modelKey]) {
      index[makeKey].models[modelKey] = { name: modelName, engines: new Set() };
    }
    const engineName = car.specs?.engine || (car.specs as Record<string, unknown> | undefined)?.['Engine'] || null;
    if (engineName) {
      index[makeKey].models[modelKey].engines.add(String(engineName));
    }
  }
  return index;
}

export function getCatalogMakes() {
  return Object.values(catalogIndex)
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function getCatalogModels(make: string) {
  if (!make) return [];
  const makeEntry = catalogIndex[make.toLowerCase()];
  if (!makeEntry) return [];
  return Object.values(makeEntry.models)
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function getCatalogEngines(make: string, model: string) {
  if (!make || !model) return [];
  const makeEntry = catalogIndex[make.toLowerCase()];
  if (!makeEntry) return [];
  const modelEntry = makeEntry.models[model.toLowerCase()];
  if (!modelEntry) return [];
  return Array.from(modelEntry.engines.values()).sort((a, b) => a.localeCompare(b));
}
