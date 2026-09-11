import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { MOBILE_APP_SCHEME, mobileApiBaseUrl } from './config';

export const authClient = createAuthClient({
  baseURL: mobileApiBaseUrl(),
  plugins: [
    expoClient({
      scheme: MOBILE_APP_SCHEME,
      storagePrefix: MOBILE_APP_SCHEME,
      storage: SecureStore,
    }),
    organizationClient(),
  ],
});
