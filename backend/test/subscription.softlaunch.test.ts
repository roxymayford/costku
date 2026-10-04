process.env.NODE_ENV = 'test';
process.env.ALLOW_DEMO_TOKENS = 'true';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { subscriptionRouter, IS_SOFTLAUNCH } from '../src/routes/subscription.js';

describe('Soft Launch Subscription Lock & Pro Plan Grant', () => {
  test('IS_SOFTLAUNCH flag is enabled by default', () => {
    assert.equal(IS_SOFTLAUNCH, true);
  });

  test('GET /plans indicates locked subscriptions for soft launch', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/subscription', subscriptionRouter);

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/api/subscription/plans`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.status, 'success');
      assert.equal(json.isSoftLaunch, true);
      assert.equal(json.lockSubscription, true);
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.every((p: any) => p.isLocked === true));
    } finally {
      server.close();
    }
  });

  test('GET /status grants Pro Advisor access to authenticated users during soft launch', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/subscription', subscriptionRouter);

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/api/subscription/status`, {
        headers: {
          Authorization: 'Bearer demo-softlaunch-token',
        },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.status, 'success');
      assert.equal(json.data.isPremium, true);
      assert.equal(json.data.isSoftLaunch, true);
      assert.equal(json.data.lockSubscription, true);
      assert.equal(json.data.status, 'active');
      assert.equal(json.data.plan, 'premium_monthly');
    } finally {
      server.close();
    }
  });

  test('POST /create blocks checkout attempts during soft launch', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/subscription', subscriptionRouter);

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/api/subscription/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer demo-softlaunch-token',
        },
        body: JSON.stringify({ plan: 'premium_monthly' }),
      });
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.status, 'fail');
      assert.equal(json.code, 'SOFTLAUNCH_SUBSCRIPTION_LOCKED');
    } finally {
      server.close();
    }
  });

  test('POST /simulate-activate confirms active Pro Advisor access during soft launch', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/subscription', subscriptionRouter);

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/api/subscription/simulate-activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer demo-softlaunch-token',
        },
        body: JSON.stringify({ plan: 'premium_monthly' }),
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.status, 'success');
      assert.equal(json.data.isPremium, true);
      assert.equal(json.data.isSoftLaunch, true);
    } finally {
      server.close();
    }
  });
});
