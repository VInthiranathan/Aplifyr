export const locationPreferenceKeys = ['onlyMyLocation', 'nearbyLocation', 'region', 'country', 'remote'] as const;

export function validateJobPreferences(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.location !== 'string' || input.location.trim().length > 200 ||
    !Array.isArray(input.roles) || input.roles.length > 20 ||
    input.roles.some(role => typeof role !== 'string' || role.trim().length > 100) ||
    !Array.isArray(input.locationPreferences) || input.locationPreferences.length > 5 ||
    input.locationPreferences.some(key => !locationPreferenceKeys.includes(key))) return null;
  const roles = input.roles.map(role => (role as string).trim()).filter(Boolean);
  return {
    location: input.location.trim(),
    roles: roles.filter((role, index) => roles.findIndex(other => other.toLowerCase() === role.toLowerCase()) === index),
    locationPreferences: [...new Set(input.locationPreferences)] as string[],
  };
}
