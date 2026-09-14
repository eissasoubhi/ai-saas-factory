# Mobile platform foundations — purchases, push and EAS

This layer extends the existing Expo/Better Auth client without creating a second entitlement or identity system.

## RevenueCat boundary

The app may contain RevenueCat **public platform API keys** only:

- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`

A RevenueCat secret/server API key must never use an `EXPO_PUBLIC_` variable. The mobile configuration helper rejects obvious server-secret prefixes defensively.

Real purchases use `react-native-purchases` and require an Expo development build; Expo Go can only be treated as preview/mock behavior. The client purchase result is **not** an entitlement grant. After purchase/restore, the app asks the authenticated backend to reconcile the active user/workspace. The backend verifies provider state using server credentials and only then updates the server-owned subscription/entitlement snapshot.

If an organization already has an active Stripe-owned paid subscription, RevenueCat reconciliation must not silently replace it. Multi-provider conflict handling stays explicit and server-side.

## Push boundary

Use `expo-notifications` with an explicit EAS project id:

- `EXPO_PUBLIC_EAS_PROJECT_ID`

The device asks for notification permission, obtains an Expo push token, then sends that token through the normal authenticated API. The backend persists it with the authenticated user and active organization. A push token is a delivery coordinate, **not** authentication or authorization material, and must be revocable on sign-out/device removal.

Provider credentials for APNs/FCM/Expo push delivery belong to EAS or the server environment, never the mobile bundle.

## EAS profiles

`apps/mobile/eas.json` defines three lanes:

- `development`: internal development client for native purchase/push testing;
- `preview`: internal pre-release build;
- `production`: store build with remote versioning/auto-increment.

Before the first native build, install the Expo SDK 57-compatible native packages from the mobile workspace:

```bash
pnpm --filter @factory/mobile exec expo install expo-dev-client expo-notifications expo-constants
pnpm --filter @factory/mobile add react-native-purchases
```

Then create/link the EAS project and put only public mobile values into the EAS environment for the relevant profile. Keep RevenueCat server credentials and push-service server credentials in backend/EAS credential stores.

## Deep links

The custom application scheme remains `ai-saas-factory://`. Production OAuth/deep-link callbacks must also be explicitly allowlisted by the backend and provider configuration; never accept an arbitrary redirect URL supplied by the client.

## Release checks

- development build starts with the production native modules linked;
- purchase/restore does not change paid access until backend reconciliation succeeds;
- push registration is tied to the signed-in user and active organization;
- sign-out/revoke removes or disables the device token server-side;
- production deep links resolve only through configured schemes/origins;
- no RevenueCat server key, APNs key, FCM credential or auth cookie is present in the app bundle or logs.
