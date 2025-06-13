// src/services/cache/cache.service.interface.ts
export interface ICacheService {
    get<T>(key: string): Promise<T | null | undefined>;
    set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
    delete(key: string): Promise<void>;
    deleteByPattern(pattern: string): Promise<void>; // Peut être plus complexe à implémenter pour memory-cache
    flushAll(): Promise<void>; // Utile pour les tests
}