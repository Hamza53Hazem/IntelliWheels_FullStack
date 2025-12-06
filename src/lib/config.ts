const rawApiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.API_BASE_URL ||
  process.env.API_BASE ||
  process.env.BACKEND_URL;

function normalizeApiBase(base: string | undefined) {
  if (!base) return 'http://localhost:5000/api';
  const trimmed = base.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export const API_BASE_URL = normalizeApiBase(rawApiBase);
export const DEFAULT_GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '';

export const STORAGE_KEYS = {
  token: 'intelliwheels-token',
  user: 'intelliwheels-user',
  chatSessions: 'intelliwheels-chat-sessions',
  theme: 'intelliwheels-theme',
  serviceMode: 'intelliwheels-service-mode',
};

export const CHAT_HISTORY_LIMIT = 40;
