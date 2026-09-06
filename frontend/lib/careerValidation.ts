import type { CareerEntryInput } from '../types/api';

export class CareerValidationError extends Error {
  constructor(public field: string, public code: string) {
    super(code);
  }
}

export const isCareerId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validateCareerEntry(value: unknown): CareerEntryInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CareerValidationError('form', 'invalid');
  }
  const body = value as Record<string, unknown>;
  const fail = (field: string, code = 'invalid'): never => { throw new CareerValidationError(field, code); };
  const text = (field: string, max: number, required = false): string => {
    if (typeof body[field] !== 'string') return fail(field);
    const result = (body[field] as string).trim();
    if (required && !result) return fail(field, 'required');
    if (result.length > max) return fail(field, 'tooLong');
    return result;
  };
  if (body.kind !== 'work' && body.kind !== 'education') fail('kind');
  if (typeof body.is_current !== 'boolean') fail('is_current');
  const month = /^\d{4}-(0[1-9]|1[0-2])$/;
  const start = text('start_month', 7, true);
  if (!month.test(start) || start < '1900-01') fail('start_month');
  const end = body.is_current ? null : text('end_month', 7, true);
  if (end && (!month.test(end) || end < start)) fail('end_month', 'dateOrder');
  if (start > new Date().toISOString().slice(0, 7)) fail('start_month', 'futureStart');
  if (body.kind === 'work' && end && end > new Date().toISOString().slice(0, 7)) fail('end_month', 'futureEnd');
  if (!Array.isArray(body.skills) || body.skills.length > 50 ||
      body.skills.some(s => typeof s !== 'string' || s.trim().length > 100)) fail('skills');
  return {
    kind: body.kind as CareerEntryInput['kind'],
    title: text('title', 200, true), organization: text('organization', 200, true),
    location: text('location', 200), qualification: text('qualification', 200),
    start_month: start, end_month: end, is_current: body.is_current as boolean,
    description: text('description', 5000), achievements: text('achievements', 5000),
    learned: text('learned', 5000), strengths: text('strengths', 5000),
    skills: [...new Set((body.skills as string[]).map(s => s.trim()).filter(Boolean))],
  };
}
