/**
 * OTP rate limiter — cooldown plus per-destination and per-IP hourly caps.
 *
 * Implements otpplan.md §4.6:
 *   cooldown per user (60s)
 *   rate limit per destination (5/hour)
 *   rate limit per IP (10/hour)
 *
 * Backed by Redis when REDIS_URL is configured, otherwise by an
 * in-process sliding window. The Redis client is loaded lazily and is
 * entirely optional, so the project has no hard dependency on it.
 */

import { REDIS_KEYS } from './otp.constants.js';
import { otpConfig } from './otp.config.js';

/* ──────────────────────────────────────────────────────────
   Minimal Redis abstraction
   ────────────────────────────────────────────────────────── */
interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  ttl(key: string): Promise<number>;
}

let redis: RedisLike | null = null;
let redisReady = false;
let redisAttempted = false;

/** Lazily connect to Redis. Returns null when unavailable. */
async function getRedis(): Promise<RedisLike | null> {
  if (redisAttempted) return redisReady ? redis : null;
  redisAttempted = true;

  if (!otpConfig.redisUrl) return null;

  try {
    // Dynamic import so the dependency stays optional at install time.
    // `redis` is declared as an optionalDependency; the specifier is
    // resolved at runtime and may legitimately be absent.
    const specifier = 'redis';
    const mod: any = await import(/* @vite-ignore */ specifier);
    const client = mod.createClient({ url: otpConfig.redisUrl });
    client.on('error', (err: Error) => {
      console.warn('[OTP RateLimiter] Redis error:', err.message);
    });
    await client.connect();
    redis = client as RedisLike;
    redisReady = true;
    console.log('[OTP RateLimiter] Connected to Redis.');
  } catch {
    console.warn(
      '[OTP RateLimiter] Redis unavailable — falling back to in-memory limits. ' +
        'Limits will not be shared across processes.'
    );
    redis = null;
    redisReady = false;
  }

  return redisReady ? redis : null;
}

/* ──────────────────────────────────────────────────────────
   In-memory fallback: sliding window of timestamps
   ────────────────────────────────────────────────────────── */
const buckets = new Map<string, number[]>();
const cooldowns = new Map<string, number>();

/** Drop expired entries so the fallback maps cannot grow unbounded. */
function sweep(): void {
  const now = Date.now();
  for (const [key, stamps] of buckets) {
    const live = stamps.filter((t) => now - t < 3_600_000);
    if (live.length === 0) buckets.delete(key);
    else buckets.set(key, live);
  }
  for (const [key, until] of cooldowns) {
    if (until <= now) cooldowns.delete(key);
  }
}

let sweeper: NodeJS.Timeout | null = null;
if (!sweeper) {
  sweeper = setInterval(sweep, 300_000);
  // Do not keep the process alive just for the sweeper.
  if (typeof sweeper.unref === 'function') sweeper.unref();
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry (only when blocked). */
  retryAfterSeconds: number;
}

/* ──────────────────────────────────────────────────────────
   Cooldown
   ────────────────────────────────────────────────────────── */
export async function checkCooldown(userId: string): Promise<RateLimitResult> {
  const ttl = otpConfig.resendCooldownSeconds;
  const client = await getRedis();

  if (client) {
    try {
      const key = REDIS_KEYS.cooldown(userId);
      const remaining = await client.ttl(key);
      if (remaining > 0) {
        return { allowed: false, retryAfterSeconds: remaining };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    } catch (err) {
      console.warn('[OTP RateLimiter] cooldown check failed, using memory:', (err as Error).message);
    }
  }

  const until = cooldowns.get(userId) ?? 0;
  const remainingMs = until - Date.now();
  if (remainingMs > 0) {
    return { allowed: false, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function startCooldown(userId: string): Promise<void> {
  const ttl = otpConfig.resendCooldownSeconds;
  const client = await getRedis();

  if (client) {
    try {
      await client.set(REDIS_KEYS.cooldown(userId), '1', 'EX', ttl);
      return;
    } catch (err) {
      console.warn('[OTP RateLimiter] cooldown set failed, using memory:', (err as Error).message);
    }
  }

  cooldowns.set(userId, Date.now() + ttl * 1000);
}

/* ──────────────────────────────────────────────────────────
   Windowed counters
   ────────────────────────────────────────────────────────── */
async function consumeWindow(
  key: string,
  max: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const client = await getRedis();

  if (client) {
    try {
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, windowSeconds);
      }
      if (count > max) {
        const ttl = await client.ttl(key);
        return {
          allowed: false,
          retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    } catch (err) {
      console.warn('[OTP RateLimiter] window check failed, using memory:', (err as Error).message);
    }
  }

  const now = Date.now();
  const stamps = (buckets.get(key) ?? []).filter((t) => now - t < windowSeconds * 1000);

  if (stamps.length >= max) {
    const oldest = stamps[0];
    const retryMs = windowSeconds * 1000 - (now - oldest);
    buckets.set(key, stamps);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
  }

  stamps.push(now);
  buckets.set(key, stamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Cap per destination (email / phone). */
export async function checkDestinationLimit(destination: string): Promise<RateLimitResult> {
  return consumeWindow(
    REDIS_KEYS.rateDest(destination),
    otpConfig.maxRequestsPerHourPerDestination,
    3600
  );
}

/** Cap per source IP. */
export async function checkIpLimit(ip: string): Promise<RateLimitResult> {
  return consumeWindow(REDIS_KEYS.rateIp(ip), otpConfig.maxRequestsPerHourPerIp, 3600);
}

/** Exposed for tests and diagnostics. */
export function resetRateLimiterState(): void {
  buckets.clear();
  cooldowns.clear();
}

/** Whether the limiter is Redis-backed or running in-memory. */
export function rateLimiterBackend(): 'redis' | 'memory' {
  return redisReady ? 'redis' : 'memory';
}
