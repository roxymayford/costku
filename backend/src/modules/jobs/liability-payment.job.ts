// ──────────────────────────────────────────────────────────
// costKu — Liability Payment Scheduler Job
// Sweeps active liabilities on their due date to record auto-cut payments
// ──────────────────────────────────────────────────────────

import { supabaseAdmin, isSupabaseConfigured } from '../../lib/supabase.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function processDueLiabilities(): Promise<{ processed: number; errors: number }> {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return { processed: 0, errors: 0 };
  }

  const now = new Date();
  const currentDay = now.getDate();
  const currentPeriod = now.toISOString().slice(0, 7); // 'YYYY-MM'

  try {
    // Find all active liabilities where due_day is today
    const { data: liabilities, error } = await supabaseAdmin
      .from('liabilities')
      .select('*')
      .eq('status', 'active')
      .eq('due_day', currentDay);

    if (error || !liabilities || liabilities.length === 0) {
      return { processed: 0, errors: error ? 1 : 0 };
    }

    let processed = 0;
    let errors = 0;

    for (const item of liabilities) {
      try {
        // Attempt idempotent insert into liability_payments
        const { error: payError } = await supabaseAdmin
          .from('liability_payments')
          .insert({
            liability_id: item.id,
            user_id: item.user_id,
            period: currentPeriod,
            amount: item.monthly_amount,
            auto_generated: true,
          });

        if (payError) {
          // If unique constraint violation, it was already processed for this period
          continue;
        }

        // Also record an auto-transaction under category 'Needs' so it reflects in spending
        await supabaseAdmin.from('transactions').insert({
          user_id: item.user_id,
          title: `Auto-cut: ${item.name} (${item.type})`,
          amount: item.monthly_amount,
          category: 'Needs',
          transaction_date: now.toISOString().slice(0, 10),
        });

        // Decrement tenor if applicable
        if (typeof item.remaining_tenor === 'number') {
          const newTenor = Math.max(0, item.remaining_tenor - 1);
          await supabaseAdmin
            .from('liabilities')
            .update({
              remaining_tenor: newTenor,
              status: newTenor === 0 ? 'paid_off' : 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
        }

        processed++;
      } catch (err) {
        errors++;
        console.warn(`[LiabilityJob] Error processing liability ${item.id}:`, err);
      }
    }

    if (processed > 0) {
      console.log(`[LiabilityJob] Processed ${processed} auto-cut payment(s) for period ${currentPeriod}.`);
    }

    return { processed, errors };
  } catch (err) {
    console.error('[LiabilityJob] Unexpected failure:', err);
    return { processed: 0, errors: 1 };
  }
}

let liabilityTimer: NodeJS.Timeout | null = null;

export function registerLiabilityJobs(): void {
  if (liabilityTimer) return;

  // Run 10s after boot for dev visibility, then once daily
  const bootDelayMs = 10_000;
  setTimeout(() => {
    void processDueLiabilities();
  }, bootDelayMs).unref?.();

  liabilityTimer = setInterval(() => {
    void processDueLiabilities();
  }, DAY_MS);

  if (typeof liabilityTimer.unref === 'function') {
    liabilityTimer.unref();
  }

  console.log('[LiabilityJob] Daily liability auto-cut job scheduled.');
}

export function stopLiabilityJobs(): void {
  if (liabilityTimer) {
    clearInterval(liabilityTimer);
    liabilityTimer = null;
  }
}
