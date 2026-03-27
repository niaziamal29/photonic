import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@workspace/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    values: () => chain,
    set: () => chain,
    returning: async () => [],
  };

  return {
    db: {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
    },
    buildsTable: {},
    simulationsTable: {},
  };
});

import buildsRouter from '../builds';

const invalidComponentType = 'unknown_component_type';

function createInvalidBuildPayload() {
  return {
    name: 'Invalid type build',
    layout: {
      components: [
        {
          id: 'component-1',
          type: invalidComponentType,
          label: 'Invalid component',
          x: 0,
          y: 0,
          params: {},
        },
      ],
      connections: [],
    },
  };
}

describe('builds route component type validation', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/builds', buildsRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Unable to bind test server');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });

  it('returns 400 with explicit details for unknown component type on create', async () => {
    const response = await fetch(`${baseUrl}/api/builds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createInvalidBuildPayload()),
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as any;
    expect(body.error).toBe('VALIDATION_ERROR');

    const typeIssue = body.issues.find((issue: { path: string }) => issue.path === 'layout.components.0.type');
    expect(typeIssue).toBeDefined();
    expect(typeIssue.message).toContain(invalidComponentType);
    expect(typeIssue.message).toContain('Supported types:');
  });

  it('returns 400 with explicit details for unknown component type on update', async () => {
    const response = await fetch(`${baseUrl}/api/builds/123`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        layout: createInvalidBuildPayload().layout,
      }),
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as any;
    expect(body.error).toBe('VALIDATION_ERROR');

    const typeIssue = body.issues.find((issue: { path: string }) => issue.path === 'layout.components.0.type');
    expect(typeIssue).toBeDefined();
    expect(typeIssue.message).toContain(invalidComponentType);
    expect(typeIssue.message).toContain('Supported types:');
  });
});
