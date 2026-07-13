import { expect, test } from '@playwright/test';
import { validateJsonSchema } from '../../src/core/schema.mjs';

test.describe('schema validator', () => {
  test('enforces numeric minimum and maximum constraints', () => {
    const schema = {
      type: 'object',
      required: ['approvalCount', 'score'],
      properties: {
        approvalCount: {
          type: 'integer',
          minimum: 1,
        },
        score: {
          type: 'number',
          maximum: 100,
        },
      },
    };

    expect(validateJsonSchema(schema, { approvalCount: 1, score: 100 })).toEqual([]);
    expect(validateJsonSchema(schema, { approvalCount: 0, score: 101 })).toEqual([
      '$.approvalCount must be greater than or equal to 1.',
      '$.score must be less than or equal to 100.',
    ]);
  });

  test('enforces date-time format constraints', () => {
    const schema = {
      type: 'object',
      required: ['approvedAt'],
      properties: {
        approvedAt: {
          type: 'string',
          format: 'date-time',
        },
      },
    };

    expect(validateJsonSchema(schema, { approvedAt: '2026-06-05T11:58:24.730Z' })).toEqual([]);
    expect(validateJsonSchema(schema, { approvedAt: 'not a date' })).toEqual([
      '$.approvedAt must be a valid date-time.',
    ]);
  });
});
