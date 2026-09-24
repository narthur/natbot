import { DurableObject } from "cloudflare:workers";

/** Singleton daily cap on model calls, so a public endpoint can't run up an unbounded bill. */
export class Budget extends DurableObject<Env> {
  async spend(dailyLimit: number): Promise<boolean> {
    // ponytail: one storage key per UTC day, never pruned; a few hundred bytes a year.
    const day = new Date().toISOString().slice(0, 10);
    const used = (await this.ctx.storage.get<number>(day)) ?? 0;
    if (used >= dailyLimit) return false;
    await this.ctx.storage.put(day, used + 1);
    return true;
  }
}
