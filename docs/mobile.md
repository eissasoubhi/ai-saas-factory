# Expo mobile authentication

The mobile app uses the existing Better Auth backend in `apps/web`; it does not create a second identity service.

## Session architecture

- `@better-auth/expo` is installed on the web server and native client at the same Better Auth version.
- the native client stores Better Auth cookies/session cache through `expo-secure-store`.
- the custom application scheme is `ai-saas-factory://`.
- production mobile builds require an HTTPS `EXPO_PUBLIC_API_URL`.
- authenticated non-Better-Auth API calls obtain the cookie with `await authClient.getCookie()` and send it in the `Cookie` header through `lib/api-client.ts`.
- the active workspace is still server-authoritative session state and is switched with Better Auth's organization endpoint.

## Local development

Set a backend URL reachable from the device:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000
```

`localhost` works for some simulator/emulator setups. A physical phone normally needs the development machine's LAN address or a tunnel, for example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
```

The server trusts the dedicated `ai-saas-factory://` scheme in every environment. Broad `exp://` origins are enabled only when `NODE_ENV=development`.

Start the backend and Expo app:

```bash
pnpm dev
pnpm --filter @factory/mobile start
```

## Production

`EXPO_PUBLIC_API_URL` is intentionally public configuration and is bundled into the app. Never put provider keys or private server configuration into any `EXPO_PUBLIC_*` variable.

Use an HTTPS backend URL and keep Better Auth, Stripe, AI, storage and platform-encryption credentials only in server/worker environments.

## Current scope

V0.5A covers email/password session establishment/restoration, sign-out, secure cookie storage, authenticated API request plumbing, organization listing and active-workspace switching. RevenueCat, push notifications and EAS release automation remain later V0.5 work.
