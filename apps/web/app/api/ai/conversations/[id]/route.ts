import {
  deleteConversationForOrganization,
  getConversationForOrganization,
  setConversationArchived,
} from '@factory/db';
import { auth } from '@/lib/auth';

async function activeOrganizationId(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.session.activeOrganizationId ?? null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const organizationId = await activeOrganizationId(request);
  if (!organizationId) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const { id } = await context.params;
  const current = await getConversationForOrganization(organizationId, id);
  if (!current) return Response.json({ error: 'Conversation not found.' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { archived?: boolean } | null;
  if (typeof body?.archived !== 'boolean') {
    return Response.json({ error: 'archived must be a boolean.' }, { status: 400 });
  }

  const updated = await setConversationArchived({
    organizationId,
    conversationId: id,
    archived: body.archived,
  });
  return Response.json({ conversation: updated });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const organizationId = await activeOrganizationId(request);
  if (!organizationId) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const { id } = await context.params;
  const deleted = await deleteConversationForOrganization(organizationId, id);
  if (!deleted) return Response.json({ error: 'Conversation not found.' }, { status: 404 });
  return new Response(null, { status: 204 });
}
