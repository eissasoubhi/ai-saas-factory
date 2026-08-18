import { expect, test } from '@playwright/test';

test('health endpoint and public navigation are reachable', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: 'ok', service: 'web' });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /pricing/i })).toBeVisible();
});

test('auth forms expose browser-side validation without external providers', async ({ page }) => {
  await page.goto('/sign-up');
  const password = page.getByLabel('Password');
  await expect(password).toHaveAttribute('minlength', '10');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/sign-up$/);

  await page.goto('/sign-in');
  await expect(page.getByLabel('Email')).toHaveAttribute('required', '');
  await expect(page.getByLabel('Password')).toHaveAttribute('required', '');
});
