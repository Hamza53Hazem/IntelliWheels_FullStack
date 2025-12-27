#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const resolvePath = (relativePath) => path.resolve(ROOT, relativePath);

function hashString(value) {
  return Array.from(value).reduce((hash, char) => hash + char.charCodeAt(0), 0);
}

const workbookPath = resolvePath('cars.xlsx');
if (!fs.existsSync(workbookPath)) {
  console.error('cars.xlsx not found at project root.');
  process.exit(1);
}

const workbook = xlsx.readFile(workbookPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

const MODEL_FIELDS = ['Variant', 'Variant Name', 'Trim', 'Trim Name', 'Version', 'Name', 'Model'];
const PRICE_FIELDS = ['Price (AED)', 'Price AED', 'Price – AED', 'Price', 'MSRP (AED)', 'MSRP'];

const cleanString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const sanitizeNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractModel = (row) => {
  const make = cleanString(row['Make']);
  for (const field of MODEL_FIELDS) {
    const candidate = cleanString(row[field]);
    if (candidate) {
      return candidate;
    }
  }
  const naming = cleanString(row['Naming']);
  if (naming) {
    let parsed = naming;
    if (make) {
      parsed = parsed.replace(new RegExp(`^${make}\\s+`, 'i'), '');
    }
    parsed = parsed.replace(/\b(19|20)\d{2}\b/g, '').trim();
    if (parsed) {
      return parsed;
    }
  }
  return 'Model';
};

const extractPrice = (row, hashedFallback) => {
  for (const field of PRICE_FIELDS) {
    const value = sanitizeNumber(row[field]);
    if (value) {
      return value;
    }
  }
  return hashedFallback;
};

const makeBaseline = {
  BMW: 320000,
  Mercedes: 340000,
  Toyota: 190000,
  Lexus: 280000,
  Audi: 300000,
  Porsche: 420000,
  Nissan: 160000,
  Tesla: 350000,
};

const normalizeCar = (row, id) => {
  const make = cleanString(row['Make']) || 'Unknown';
  const model = extractModel(row);
  const image = cleanString(row['Image URL']) || null;
  const currency = cleanString(row['Currency']) || 'AED';
  const hash = hashString(`${make}-${model}`);
  const base = makeBaseline[make] ?? 220000;
  const price = extractPrice(row, base + (hash % 75000));

  return {
    id,
    make,
    model,
    year: 2020 + ((hash % 5) + 1),
    price,
    currency,
    rating: Math.round((4 + (hash % 10) / 20) * 10) / 10,
    reviews: 25 + (hash % 120),
    description: `${make} ${model} imported from local catalog.`,
    image,
    specs: {
      bodyStyle: hash % 2 === 0 ? 'SUV' : 'Sedan',
      horsepower: 250 + (hash % 400),
      engine: hash % 3 === 0 ? 'Hybrid' : 'Gasoline',
      fuelEconomy: `${8 + (hash % 6)} L/100km`,
    },
  };
};

const seenKeys = new Set();
const normalized = [];
let duplicates = 0;

rows.forEach((row) => {
  if (!row['Make'] || !row['Model']) return;
  const make = cleanString(row['Make']);
  const model = extractModel(row);
  const key = `${make.toLowerCase()}::${model.toLowerCase()}`;
  if (seenKeys.has(key)) {
    duplicates += 1;
    return;
  }
  seenKeys.add(key);
  normalized.push(normalizeCar(row, normalized.length + 1));
});

const outputDir = resolvePath('src/data');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'cars.json');
fs.writeFileSync(outputPath, JSON.stringify(normalized, null, 2));
console.log(`Wrote ${normalized.length} cars to ${outputPath}`);
if (duplicates) {
  console.log(`Skipped ${duplicates} duplicate entries (same make + model).`);
}
