import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI SaaS Factory',
  description: 'Production SaaS plumbing for AI products.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
