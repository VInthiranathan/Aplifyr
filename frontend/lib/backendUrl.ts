const DEFAULT_BACKEND_URL = "";

function normalizeBackendUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return DEFAULT_BACKEND_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

export function getServerBackendUrl(env: NodeJS.ProcessEnv = process.env) {
  return normalizeBackendUrl(
    env.BACKEND_URL ?? env.NEXT_PUBLIC_BACKEND_URL,
  );
}

export function getPublicBackendUrl(env: NodeJS.ProcessEnv = process.env) {
  return normalizeBackendUrl(
    env.NEXT_PUBLIC_BACKEND_URL ?? env.BACKEND_URL,
  );
}

export function isDebugUiEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NEXT_PUBLIC_ENABLE_DEBUG_UI === "true" || env.NODE_ENV !== "production";
}