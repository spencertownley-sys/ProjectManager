"use server";

import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentSession } from "@/lib/auth/current";
import * as workspaces from "@/lib/services/workspaces";
import * as fields from "@/lib/services/fields";
import { workspaceSettingsInput, inviteMemberInput, changeMemberRoleInput, createFieldInput, updateFieldInput, projectFieldLinkInput, tagInput, updateTagInput, notificationPreferenceInput } from "@/lib/validation/settings";
import { run } from "./result";

const slug = z.string().min(1);

/** The Clerk Backend API as the membership directory the service expects (docs/08 section 3). */
async function clerkDirectory(): Promise<workspaces.MembershipDirectory> {
  const client = await clerkClient();
  return {
    invite: async (input) => {
      const inv = await client.organizations.createOrganizationInvitation({ organizationId: input.organizationId, emailAddress: input.emailAddress, role: input.role, inviterUserId: input.inviterUserId });
      return { id: inv.id };
    },
    listInvitations: async (organizationId) => {
      const res = await client.organizations.getOrganizationInvitationList({ organizationId, status: ["pending"], limit: 100 });
      return res.data.map((i) => ({ id: i.id, emailAddress: i.emailAddress, role: i.role, createdAt: new Date(i.createdAt).toISOString() }));
    },
    revokeInvitation: async (input) => {
      await client.organizations.revokeOrganizationInvitation(input);
    },
    updateRole: async (input) => {
      await client.organizations.updateOrganizationMembership(input);
    },
    remove: async (input) => {
      await client.organizations.deleteOrganizationMembership(input);
    },
  };
}

export async function updateWorkspaceSettingsAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    const ws = await workspaces.updateWorkspaceSettings(session, workspaceSettingsInput.parse(input));
    return { id: ws.id, name: ws.name };
  });
}

export async function inviteMemberAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return workspaces.inviteMember(session, await clerkDirectory(), inviteMemberInput.parse(input));
  });
}

export async function listInvitationsAction(workspaceSlug: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return workspaces.listPendingInvitations(session, await clerkDirectory());
  });
}

export async function revokeInvitationAction(workspaceSlug: string, invitationId: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await workspaces.revokeInvitation(session, await clerkDirectory(), z.string().min(1).parse(invitationId));
    return { id: invitationId };
  });
}

export async function changeMemberRoleAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await workspaces.changeMemberRole(session, await clerkDirectory(), changeMemberRoleInput.parse(input));
    return { ok: true };
  });
}

export async function removeMemberAction(workspaceSlug: string, userId: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await workspaces.removeMember(session, await clerkDirectory(), z.string().uuid().parse(userId));
    return { id: userId };
  });
}

export async function updateMemberCapacityAction(workspaceSlug: string, userId: string, hours: number) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await workspaces.updateMemberCapacity(session, z.string().uuid().parse(userId), z.number().min(0).max(168).parse(hours));
    return { ok: true };
  });
}

export async function createFieldAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return fields.createField(session, createFieldInput.parse(input));
  });
}

export async function updateFieldAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return fields.updateField(session, updateFieldInput.parse(input));
  });
}

export async function deleteFieldAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await fields.deleteField(session, z.string().uuid().parse(id));
    return { id };
  });
}

export async function attachFieldAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    const parsed = projectFieldLinkInput.parse(input);
    await fields.attachField(session, parsed.projectId, parsed.fieldId);
    return { ok: true };
  });
}

export async function detachFieldAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    const parsed = projectFieldLinkInput.parse(input);
    await fields.detachField(session, parsed.projectId, parsed.fieldId);
    return { ok: true };
  });
}

export async function reorderProjectFieldsAction(workspaceSlug: string, projectId: string, orderedIds: string[]) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await fields.reorderProjectFields(session, z.string().uuid().parse(projectId), z.array(z.string().uuid()).parse(orderedIds));
    return { ok: true };
  });
}

export async function createTagSettingsAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return workspaces.createTag(session, tagInput.parse(input));
  });
}

export async function updateTagAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return workspaces.updateTag(session, updateTagInput.parse(input));
  });
}

export async function deleteTagAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await workspaces.deleteTag(session, z.string().uuid().parse(id));
    return { id };
  });
}

export async function setNotificationPreferenceAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await workspaces.setNotificationPreference(session, notificationPreferenceInput.parse(input));
    return { ok: true };
  });
}
