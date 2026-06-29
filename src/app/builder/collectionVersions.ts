export interface CollectionVersion<TVariant = unknown> {
    id: string;
    name: string;
    items: TVariant[];
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
}

export type VersionedCollection<TVariant = unknown> = {
    id: string;
    title: string;
    items: TVariant[];
    activeVersionId?: string;
    versions?: CollectionVersion<TVariant>[];
};

const DEFAULT_VERSION_ID = "default";
const DEFAULT_VERSION_NAME = "Default";

function clonePlain<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
    return new Date().toISOString();
}

function sameItems<TVariant>(a: TVariant[], b: TVariant[]) {
    return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function createDefaultVersion<TVariant>(collection: VersionedCollection<TVariant>): CollectionVersion<TVariant> {
    const timestamp = nowIso();
    return {
        id: DEFAULT_VERSION_ID,
        name: DEFAULT_VERSION_NAME,
        items: clonePlain(Array.isArray(collection.items) ? collection.items : []),
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

function makeUniqueVersionId(existingIds: Set<string>, preferredId?: string) {
    const base = preferredId?.trim() || `version-${Date.now().toString(36)}`;
    let candidate = base;
    let suffix = 2;
    while (existingIds.has(candidate)) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    existingIds.add(candidate);
    return candidate;
}

export function makeUniqueVersionName(
    existingNames: string[],
    preferredName: string,
    ignoredName?: string,
) {
    const fallback = preferredName.trim() || "Version";
    const taken = new Set(
        existingNames
            .filter(name => name !== ignoredName)
            .map(name => name.trim().toLowerCase())
            .filter(Boolean)
    );
    if (!taken.has(fallback.toLowerCase())) return fallback;

    let suffix = 2;
    let candidate = `${fallback} ${suffix}`;
    while (taken.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `${fallback} ${suffix}`;
    }
    return candidate;
}

function sanitizeVersions<TVariant>(
    collection: VersionedCollection<TVariant>,
): CollectionVersion<TVariant>[] {
    const sourceVersions = Array.isArray(collection.versions) ? collection.versions : [];
    if (sourceVersions.length === 0) return [createDefaultVersion(collection)];

    const ids = new Set<string>();
    const versions = sourceVersions
        .filter(version => version && typeof version === "object")
        .map((version, index) => {
            const timestamp = nowIso();
            const id = makeUniqueVersionId(ids, version.id || (index === 0 ? DEFAULT_VERSION_ID : undefined));
            return {
                ...version,
                id,
                name: (version.name || `${DEFAULT_VERSION_NAME} ${index + 1}`).trim(),
                items: clonePlain(Array.isArray(version.items) ? version.items : []),
                createdAt: version.createdAt || timestamp,
                updatedAt: version.updatedAt || version.createdAt || timestamp,
            };
        });

    return versions.length > 0 ? versions : [createDefaultVersion(collection)];
}

function normalizeCollection<TCollection extends VersionedCollection<TVariant>, TVariant>(
    collection: TCollection,
    source: "activeVersion" | "items",
): TCollection {
    const versions = sanitizeVersions(collection);
    const activeVersionId = versions.some(version => version.id === collection.activeVersionId)
        ? collection.activeVersionId
        : versions[0].id;
    const rootItems = clonePlain(Array.isArray(collection.items) ? collection.items : []);

    const nextVersions = source === "items"
        ? versions.map(version => {
            if (version.id !== activeVersionId) return version;
            if (sameItems(version.items, rootItems)) return version;
            return {
                ...version,
                items: rootItems,
                updatedAt: nowIso(),
            };
        })
        : versions;

    const activeVersion = nextVersions.find(version => version.id === activeVersionId) || nextVersions[0];
    return {
        ...collection,
        activeVersionId,
        versions: nextVersions,
        items: clonePlain(activeVersion.items),
    };
}

export function normalizeCollectionForLoad<TCollection extends VersionedCollection<TVariant>, TVariant>(
    collection: TCollection,
): TCollection {
    return normalizeCollection(collection, "activeVersion");
}

export function syncCollectionWithActiveVersion<TCollection extends VersionedCollection<TVariant>, TVariant>(
    collection: TCollection,
): TCollection {
    return normalizeCollection(collection, "items");
}

export function normalizeCollectionsForLoad<TCollection extends VersionedCollection<TVariant>, TVariant>(
    collections: TCollection[],
): TCollection[] {
    return collections.map(collection => normalizeCollectionForLoad(collection));
}

export function syncCollectionsWithActiveVersions<TCollection extends VersionedCollection<TVariant>, TVariant>(
    collections: TCollection[],
): TCollection[] {
    return collections.map(collection => syncCollectionWithActiveVersion(collection));
}

export function getCollectionVersions<TVariant>(
    collection: VersionedCollection<TVariant>,
): CollectionVersion<TVariant>[] {
    return normalizeCollectionForLoad(collection).versions || [];
}

export function getActiveCollectionVersion<TVariant>(
    collection: VersionedCollection<TVariant>,
): CollectionVersion<TVariant> {
    const normalized = normalizeCollectionForLoad(collection);
    const versions = normalized.versions || [];
    return versions.find(version => version.id === normalized.activeVersionId) || versions[0];
}

export function switchCollectionVersion<TCollection extends VersionedCollection<TVariant>, TVariant>(
    collection: TCollection,
    versionId: string,
): TCollection {
    const normalized = normalizeCollectionForLoad(collection);
    const versions = normalized.versions || [];
    const nextActive = versions.find(version => version.id === versionId) || versions[0];
    return {
        ...normalized,
        activeVersionId: nextActive.id,
        items: clonePlain(nextActive.items),
    };
}

export function createCollectionVersion<TCollection extends VersionedCollection<TVariant>, TVariant>(
    collection: TCollection,
    name: string,
    duplicateActive: boolean,
): TCollection {
    const normalized = syncCollectionWithActiveVersion(collection);
    const versions = normalized.versions || [];
    const activeVersion = versions.find(version => version.id === normalized.activeVersionId) || versions[0];
    const timestamp = nowIso();
    const nextVersion: CollectionVersion<TVariant> = {
        id: makeUniqueVersionId(new Set(versions.map(version => version.id))),
        name: makeUniqueVersionName(versions.map(version => version.name), name || (duplicateActive ? `${activeVersion.name} Copy` : "New Version")),
        items: duplicateActive ? clonePlain(activeVersion.items) : [],
        createdAt: timestamp,
        updatedAt: timestamp,
    };

    return {
        ...normalized,
        activeVersionId: nextVersion.id,
        versions: [...versions, nextVersion],
        items: clonePlain(nextVersion.items),
    };
}

export function renameCollectionVersion<TCollection extends VersionedCollection<TVariant>, TVariant>(
    collection: TCollection,
    versionId: string,
    name: string,
): TCollection {
    const normalized = syncCollectionWithActiveVersion(collection);
    const versions = normalized.versions || [];
    const current = versions.find(version => version.id === versionId);
    if (!current) return normalized;

    const nextName = makeUniqueVersionName(versions.map(version => version.name), name, current.name);
    return {
        ...normalized,
        versions: versions.map(version => version.id === versionId
            ? { ...version, name: nextName, updatedAt: nowIso() }
            : version
        ),
    };
}

export function deleteCollectionVersion<TCollection extends VersionedCollection<TVariant>, TVariant>(
    collection: TCollection,
    versionId: string,
): TCollection {
    const normalized = syncCollectionWithActiveVersion(collection);
    const versions = normalized.versions || [];
    if (versions.length <= 1) return normalized;

    const remainingVersions = versions.filter(version => version.id !== versionId);
    if (remainingVersions.length === versions.length) return normalized;

    const nextActiveId = normalized.activeVersionId === versionId
        ? remainingVersions[0].id
        : normalized.activeVersionId;
    const nextActive = remainingVersions.find(version => version.id === nextActiveId) || remainingVersions[0];

    return {
        ...normalized,
        activeVersionId: nextActive.id,
        versions: remainingVersions,
        items: clonePlain(nextActive.items),
    };
}
