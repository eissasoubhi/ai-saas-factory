import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

test('verified user can sign in, create a workspace and reach the dashboard', async ({ page }) => {
  test.skip(!databaseUrl, 'DATABASE_URL is required for the authenticated E2E fixture');

  const nonce = randomUUID().slice(0, 8);
  const email = `e2e-${nonce}@example.com`;
  const password = `E2e-password-${nonce}!`;
  const workspaceName = `E2E ${nonce}`;
  const workspaceSlug = `e2e-${nonce}`;

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/Account created\. Check your inbox/i)).toBeVisible();

  const sql = postgres(databaseUrl as string, { max: 1 });
  try {
    const updated = await sql<{ id: string }[]>`
      update "user"
      set email_verified = true, updated_at = now()
      where email = ${email}
      returning id
    `;
    expect(updated).toHaveLength(1);
  } finally {
    await sql.end();
  }

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel('Workspace name').fill(workspaceName);
  await page.getByLabel('Slug').fill(workspaceSlug);
  await page.getByRole('button', { name: 'Create workspace' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(page.getByText(workspaceName, { exact: true })).toBeVisible();
});
