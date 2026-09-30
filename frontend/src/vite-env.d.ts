/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK_DATA?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_USE_MOCKS?: string;
}
