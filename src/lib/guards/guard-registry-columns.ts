export type GuardRegistryColumnId =
  | "index"
  | "lastName"
  | "firstName"
  | "middleName"
  | "birthDate"
  | "phone"
  | "contactPhone"
  | "position"
  | "license"
  | "grade"
  | "licenseValid"
  | "employment"
  | "employedOn"
  | "medical"
  | "periodic"
  | "personalCard"
  | "car"
  | "uniform"
  | "objects"
  | "status"
  | "dismissedOn"
  | "actions";

export const GUARD_REGISTRY_COLUMN_STORAGE_KEY = "guard-registry-column-order-v1";

export function getGuardRegistryColumnStorageKey(userId?: string): string {
  return userId ? `guard-registry-column-order-${userId}-v1` : GUARD_REGISTRY_COLUMN_STORAGE_KEY;
}

export function getGuardRegistryHiddenColumnsStorageKey(userId?: string): string {
  return userId ? `guard-registry-hidden-columns-${userId}-v1` : "guard-registry-hidden-columns-v1";
}

/** Не перетаскиваются — всегда по краям. */
export const GUARD_REGISTRY_PINNED_COLUMNS: GuardRegistryColumnId[] = ["index", "actions"];

export const DEFAULT_GUARD_REGISTRY_COLUMN_ORDER: GuardRegistryColumnId[] = [
  "index",
  "lastName",
  "firstName",
  "middleName",
  "birthDate",
  "phone",
  "contactPhone",
  "position",
  "license",
  "grade",
  "licenseValid",
  "employment",
  "employedOn",
  "medical",
  "periodic",
  "personalCard",
  "car",
  "uniform",
  "objects",
  "status",
  "dismissedOn",
  "actions",
];

const ALL_COLUMN_IDS = new Set<GuardRegistryColumnId>(DEFAULT_GUARD_REGISTRY_COLUMN_ORDER);

export function isGuardRegistryColumnId(value: string): value is GuardRegistryColumnId {
  return ALL_COLUMN_IDS.has(value as GuardRegistryColumnId);
}

export function normalizeGuardRegistryColumnOrder(raw: unknown): GuardRegistryColumnId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_GUARD_REGISTRY_COLUMN_ORDER];
  const draggable = raw.filter(
    (id): id is GuardRegistryColumnId =>
      typeof id === "string" && isGuardRegistryColumnId(id) && !GUARD_REGISTRY_PINNED_COLUMNS.includes(id as GuardRegistryColumnId),
  );
  const merged = [...draggable];
  for (const id of DEFAULT_GUARD_REGISTRY_COLUMN_ORDER) {
    if (GUARD_REGISTRY_PINNED_COLUMNS.includes(id)) continue;
    if (!merged.includes(id)) merged.push(id);
  }
  let order: GuardRegistryColumnId[] = ["index", ...merged, "actions"];
  if (order.includes("firstName") && !order.includes("middleName")) {
    const firstNameIndex = order.indexOf("firstName");
    order.splice(firstNameIndex + 1, 0, "middleName");
  }
  return order;
}

export function loadGuardRegistryColumnOrder(userId?: string): GuardRegistryColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_GUARD_REGISTRY_COLUMN_ORDER];
  try {
    const key = getGuardRegistryColumnStorageKey(userId);
    let raw = window.localStorage.getItem(key);
    if (!raw && userId) {
      raw = window.localStorage.getItem(GUARD_REGISTRY_COLUMN_STORAGE_KEY);
    }
    if (!raw) return [...DEFAULT_GUARD_REGISTRY_COLUMN_ORDER];
    return normalizeGuardRegistryColumnOrder(JSON.parse(raw));
  } catch {
    return [...DEFAULT_GUARD_REGISTRY_COLUMN_ORDER];
  }
}

export function saveGuardRegistryColumnOrder(order: GuardRegistryColumnId[], userId?: string): void {
  if (typeof window === "undefined") return;
  const key = getGuardRegistryColumnStorageKey(userId);
  const draggable = order.filter((id) => !GUARD_REGISTRY_PINNED_COLUMNS.includes(id));
  window.localStorage.setItem(key, JSON.stringify(draggable));
}

const LEGACY_HIDDEN_COLUMNS_KEY = "guard-registry-hidden-columns-v1";

function readJsonArray(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeGuardRegistryHiddenColumns(raw: unknown): GuardRegistryColumnId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is GuardRegistryColumnId => typeof id === "string" && isGuardRegistryColumnId(id),
  );
}

export function loadGuardRegistryHiddenColumns(userId?: string): GuardRegistryColumnId[] {
  if (typeof window === "undefined") return [];
  try {
    const key = getGuardRegistryHiddenColumnsStorageKey(userId);
    let parsed = readJsonArray(window.localStorage.getItem(key));
    if (!parsed && userId) {
      parsed = readJsonArray(window.localStorage.getItem(LEGACY_HIDDEN_COLUMNS_KEY));
    }
    return normalizeGuardRegistryHiddenColumns(parsed);
  } catch {
    return [];
  }
}

export function saveGuardRegistryHiddenColumns(
  hidden: GuardRegistryColumnId[],
  userId?: string,
): void {
  if (typeof window === "undefined") return;
  const key = getGuardRegistryHiddenColumnsStorageKey(userId);
  window.localStorage.setItem(key, JSON.stringify(hidden));
}

export type GuardRegistryColumnMeta = {
  id: GuardRegistryColumnId;
  label: string;
  multilineLabel?: string;
  title?: string;
  headerClass?: string;
  draggable: boolean;
};

export const GUARD_REGISTRY_COLUMN_META: Record<GuardRegistryColumnId, GuardRegistryColumnMeta> = {
  index: { id: "index", label: "№", headerClass: "w-10", draggable: false },
  lastName: { id: "lastName", label: "Фамилия", draggable: true },
  firstName: { id: "firstName", label: "Имя", draggable: true },
  middleName: { id: "middleName", label: "Отчество", draggable: true },
  birthDate: {
    id: "birthDate",
    label: "Дата рожд.",
    multilineLabel: "Дата рожд.",
    title: "Дата рождения",
    draggable: true,
  },
  phone: { id: "phone", label: "Телефон", draggable: true },
  contactPhone: {
    id: "contactPhone",
    label: "Конт. телефон",
    multilineLabel: "Конт. телефон",
    title: "Контактный телефон",
    draggable: true,
  },
  position: { id: "position", label: "Должность", draggable: true },
  license: { id: "license", label: "Уд.", title: "Удостоверение", draggable: true },
  grade: { id: "grade", label: "Разряд", draggable: true },
  licenseValid: {
    id: "licenseValid",
    label: "до какого",
    multilineLabel: "до какого",
    title: "Действует до",
    draggable: true,
  },
  employment: { id: "employment", label: "Труд.", title: "Трудоустроен", draggable: true },
  employedOn: {
    id: "employedOn",
    label: "Дата оф. труд.",
    multilineLabel: "Дата оф. труд.",
    title: "Дата официального трудоустройства",
    draggable: true,
  },
  medical: {
    id: "medical",
    label: "Мед. комиссия",
    multilineLabel: "Мед. комиссия",
    title: "Медкомиссия",
    draggable: true,
  },
  periodic: {
    id: "periodic",
    label: "Пер. проверка",
    multilineLabel: "Пер. проверка",
    title: "Периодическая проверка",
    draggable: true,
  },
  personalCard: { id: "personalCard", label: "ЛК", title: "Личная карточка", draggable: true },
  car: { id: "car", label: "Авто", draggable: true },
  uniform: { id: "uniform", label: "Форма", draggable: true },
  objects: { id: "objects", label: "Объекты", draggable: true },
  status: { id: "status", label: "Статус", draggable: true },
  dismissedOn: {
    id: "dismissedOn",
    label: "Дата ув.",
    multilineLabel: "Дата ув.",
    title: "Дата увольнения",
    draggable: true,
  },
  actions: { id: "actions", label: "", headerClass: "w-14", draggable: false },
};
