const normalize = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const subtypePages = Object.freeze({
  "Dragão": [3, 5, 6, 7, 8, 9, 10, 11, 23, 24, 25, 216],
  Goblin: [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 296, 299, 300, 301],
  Gato: [213, 214, 215, 216, 217, 218, 219, 220, 221, 233, 244, 245, 246, 247],
  Vampiro: [130, 131, 133, 134, 135, 136, 137, 138, 139, 140],
  Recruta: [182, 183, 184, 185, 186, 187, 188, 189, 190],
  "Fênix": [82, 83],
});

const pageSubtypes = new Map();
for (const [subtype, pages] of Object.entries(subtypePages)) for (const page of pages) {
  const values = pageSubtypes.get(page) || [];
  values.push(subtype);
  pageSubtypes.set(page, values);
}

export function subtypesFor(card) {
  const explicit = Array.isArray(card?.subtypes) ? card.subtypes : [];
  const temporary = Array.isArray(card?.temporarySubtypes) ? card.temporarySubtypes : [];
  return [...new Set([...explicit, ...temporary, ...(pageSubtypes.get(Number(card?.page)) || [])])];
}

export function hasSubtype(card, subtype) {
  const wanted = normalize(subtype);
  return subtypesFor(card).some((value) => normalize(value) === wanted);
}

export function withDerivedSubtypes(card) {
  return { ...card, subtypes: subtypesFor(card) };
}

export { subtypePages };

