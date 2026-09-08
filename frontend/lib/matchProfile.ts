import type { MatchProfileRequest } from '../types/api';

/** Use only explicit skills. Career descriptions and education titles are not desired roles. */
export function collectMatchSkills(profileSkills: unknown, entries: { skills?: unknown }[] = []): string[] {
  const values = [profileSkills, ...entries.map(entry => entry.skills)].flatMap(value => Array.isArray(value) ? value : []);
  const seen = new Set<string>();
  return values.filter((value): value is string => typeof value === 'string')
    .map(value => value.trim()).filter(value => {
      if (!value || value.length > 100 || seen.has(value.toLowerCase())) return false;
      seen.add(value.toLowerCase());
      return true;
    }).slice(0, 200);
}

export function matchProfileKey(profile: MatchProfileRequest) {
  return JSON.stringify({ roles: [...(profile.roles ?? [])].sort(), title: profile.title ?? '',
    tags: [...(profile.tags ?? [])].sort(), location: profile.location ?? '',
    locationPreferences: [...(profile.locationPreferences ?? [])].sort() });
}
