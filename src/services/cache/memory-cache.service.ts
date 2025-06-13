// src/services/cache/memory-cache.service.ts
import NodeCache from 'node-cache';
import { ICacheService } from './cache.service.interface';

export class MemoryCacheService implements ICacheService {
    private cache: NodeCache;

    constructor(stdTTL: number = 3600, checkperiod: number = 600) { // TTL par défaut 1h, check toutes les 10min
        this.cache = new NodeCache({
            stdTTL,          // secondes
            checkperiod,     // secondes
            useClones: false // Important pour la performance et pour éviter des comportements inattendus avec les objets mutables
        });
    }

    async get<T>(key: string): Promise<T | null | undefined> {
        const value = this.cache.get<T>(key);
        return Promise.resolve(value); // Retourne undefined si non trouvé ou expiré
    }

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
        this.cache.set(key, value, ttlSeconds);
        return Promise.resolve();
    }

    async delete(key: string): Promise<void> {
        this.cache.del(key);
        return Promise.resolve();
    }

    async deleteByPattern(pattern: string): Promise<void> {
        // node-cache ne supporte pas nativement les patterns comme Redis avec SCAN ou KEYS *.
        // On doit itérer sur toutes les clés. C'est coûteux pour un grand cache.
        // Pour un cache en mémoire, cela peut être acceptable pour un nombre limité de clés
        // ou si le pattern est simple (ex: préfixe).
        const keys = this.cache.keys();
        const regex = new RegExp(pattern.replace(/\*/g, '.*')); // Convertir le glob pattern en regex

        keys.forEach((key: any) => {
            if (regex.test(key)) {
                this.cache.del(key);
            }
        });
        console.warn(`[MemoryCacheService] deleteByPattern for "${pattern}" iterated ${keys.length} keys. Consider Redis for production.`);
        return Promise.resolve();
    }

    async flushAll(): Promise<void> {
        this.cache.flushAll();
        return Promise.resolve();
    }
}