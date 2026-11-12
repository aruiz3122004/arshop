import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private isReady = false;
  private readonly memoryCache = new Map<string, MemoryEntry>();
  private lastErrorLogTime = 0;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const rawHost = this.config.getOrThrow<string>("REDIS_HOST");
    const host = rawHost.replace(/^https?:\/\//i, "").replace(/^rediss?:\/\//i, "").replace(/\/+$/, "").trim();
    const port = this.config.getOrThrow<number>("REDIS_PORT");
    const password = this.config.get<string>("REDIS_PASSWORD") || undefined;
    const useTls = this.config.get<boolean>("REDIS_TLS");

    this.client = new Redis({
      host,
      port,
      password,
      tls: useTls ? {} : undefined,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 1000, 10000),
    });

    this.client.on("ready", () => {
      this.isReady = true;
      this.logger.log(`Redis ready at ${host}:${port}`);
    });

    this.client.on("close", () => {
      this.isReady = false;
    });

    this.client.on("end", () => {
      this.isReady = false;
    });

    this.client.on("error", (err) => {
      this.isReady = false;
      this.logThrottledError(err.message);
    });
  }

  private logThrottledError(msg: string) {
    const now = Date.now();
    // Limitar logs de error a máximo 1 cada 30 segundos para evitar saturación
    if (now - this.lastErrorLogTime > 30_000) {
      this.lastErrorLogTime = now;
      this.logger.warn(`Redis issue (usando fallback en memoria): ${msg}`);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  private getFromMemory(key: string): string | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setInMemory(key: string, value: string, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.memoryCache.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<string | null> {
    if (!this.isReady) {
      return this.getFromMemory(key);
    }
    try {
      const val = await this.client.get(key);
      return val ?? this.getFromMemory(key);
    } catch (err: any) {
      this.logThrottledError(err.message);
      return this.getFromMemory(key);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.setInMemory(key, value, ttlSeconds);
    if (!this.isReady) return;
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, "EX", ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err: any) {
      this.logThrottledError(err.message);
    }
  }

  async del(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (!this.isReady) return;
    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logThrottledError(err.message);
    }
  }

  async setNx(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    const existing = this.getFromMemory(key);
    if (existing !== null) {
      return false;
    }
    this.setInMemory(key, value, ttlSeconds);
    if (!this.isReady) return true;

    try {
      if (ttlSeconds) {
        const result = await this.client.set(key, value, "PX", ttlSeconds * 1000, "NX");
        return result === "OK";
      } else {
        const result = await this.client.set(key, value, "NX");
        return result === "OK";
      }
    } catch (err: any) {
      this.logThrottledError(err.message);
      return true;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const val = await this.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(data);
    await this.set(key, serialized, ttlSeconds);
  }
}
