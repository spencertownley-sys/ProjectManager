"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Add20Regular, PersonAdd20Regular } from "@fluentui/react-icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Tabs, PillTabsList, PillTabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { inviteMemberAction, changeMemberRoleAction, removeMemberAction, updateMemberCapacityAction, listInvitationsAction, revokeInvitationAction } from "@/lib/actions/settings";
import { formatDateShort } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

export type MemberRow = { id: string; displayName: string; email: string; avatarUrl: string | null; role: "owner" | "admin" | "member" | "guest"; weeklyCapacityHours: number; joinedAt: string };
type Role = MemberRow["role"];

const roleMeta: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Everything, including billing and deleting the workspace" },
  admin: { label: "Admin", description: "Manage members, settings, integrations, and every project" },
  member: { label: "Member", description: "Create projects and edit tasks" },
  guest: { label: "Guest", description: "Comment on the projects they are invited to" },
};

export function MembersTable({ members, myRole, myId, staticInvitations }: { members: MemberRow[]; myRole: Role; myId: string; staticInvitations?: Array<{ id: string; emailAddress: string; role: Role; createdAt: string }> }) {
  const { slug } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"members" | "guests" | "invitations">("members");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("member");
  const [pending, setPending] = React.useState(false);
  const [rows, setRows] = React.useState(members);
  const invitations = useQuery({
    queryKey: ["invitations", slug],
    queryFn: async () => {
      if (staticInvitations) return staticInvitations;
      const res = await call(listInvitationsAction(slug));
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    initialData: staticInvitations,
    staleTime: 30_000,
  });

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await call(inviteMemberAction(slug, { email, role }));
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not send the invitation", description: res.error.message, kind: "danger" });
      return;
    }
    toast({ title: `Invitation sent to ${email}`, kind: "success" });
    setInviteOpen(false);
    setEmail("");
    invitations.refetch();
  };
  const changeRole = async (m: MemberRow, next: Role) => {
    const previous = rows;
    setRows((r) => r.map((x) => (x.id === m.id ? { ...x, role: next } : x)));
    const res = await call(changeMemberRoleAction(slug, { userId: m.id, role: next }));
    if (!res.ok) {
      setRows(previous);
      toast({ title: "Could not change the role", description: res.error.message, kind: "danger" });
      return;
    }
    toast({ title: `${m.displayName} is now ${roleMeta[next].label.toLowerCase()}`, kind: "success" });
    router.refresh();
  };
  const remove = async (m: MemberRow) => {
    if (!window.confirm(`Remove ${m.displayName} from the workspace? Their tasks stay, unassigned.`)) return;
    const res = await call(removeMemberAction(slug, m.id));
    if (!res.ok) {
      toast({ title: "Could not remove the member", description: res.error.message, kind: "danger" });
      return;
    }
    setRows((r) => r.filter((x) => x.id !== m.id));
    toast({ title: `${m.displayName} removed`, kind: "info" });
    router.refresh();
  };
  const setCapacity = async (m: MemberRow, hours: number) => {
    if (!Number.isFinite(hours) || hours === m.weeklyCapacityHours) return;
    setRows((r) => r.map((x) => (x.id === m.id ? { ...x, weeklyCapacityHours: hours } : x)));
    const res = await call(updateMemberCapacityAction(slug, m.id, hours));
    if (!res.ok) toast({ title: "Could not save the capacity", description: res.error.message, kind: "danger" });
  };
  const revoke = async (id: string, emailAddress: string) => {
    const res = await call(revokeInvitationAction(slug, id));
    if (!res.ok) toast({ title: "Could not revoke the invitation", description: res.error.message, kind: "danger" });
    else toast({ title: `Invitation to ${emailAddress} revoked`, kind: "info" });
    invitations.refetch();
  };

  const shown = rows.filter((m) => (tab === "guests" ? m.role === "guest" : m.role !== "guest"));
  const canManage = myRole === "owner" || myRole === "admin";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <PillTabsList aria-label="Member groups">
            <PillTabsTrigger value="members">Members {rows.filter((m) => m.role !== "guest").length}</PillTabsTrigger>
            <PillTabsTrigger value="guests">Guests {rows.filter((m) => m.role === "guest").length}</PillTabsTrigger>
            <PillTabsTrigger value="invitations">Invited {invitations.data?.length ?? 0}</PillTabsTrigger>
          </PillTabsList>
        </Tabs>
        <div className="flex-1" />
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
            <PersonAdd20Regular className="h-4 w-4" /> Invite
          </Button>
        ) : null}
      </div>
      {tab === "invitations" ? (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          {invitations.isError ? <p className="p-4 type-body-1 text-fg-secondary">Invitations could not be loaded. {(invitations.error as Error).message}</p> : null}
          {invitations.data && invitations.data.length === 0 ? <p className="p-4 type-body-1 text-fg-secondary">No pending invitations.</p> : null}
          {invitations.data?.map((inv) => (
            <div key={inv.id} className="flex h-11 min-w-[480px] items-center gap-3 border-b border-border px-4 last:border-b-0">
              <span className="min-w-0 flex-1 truncate type-body-1">{inv.emailAddress}</span>
              <Badge>{roleMeta[inv.role].label}</Badge>
              <span className="w-24 type-caption-1 text-fg-tertiary">Sent {formatDateShort(inv.createdAt.slice(0, 10))}</span>
              <Button variant="subtle" size="sm" onClick={() => revoke(inv.id, inv.emailAddress)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface" role="table" aria-label={tab === "guests" ? "Guests" : "Members"}>
          <div role="row" className="flex min-w-[640px] h-8 items-center gap-3 border-b border-border bg-subtle px-4 type-caption-1-strong text-fg-secondary">
            <span className="min-w-0 flex-1" role="columnheader">Name</span>
            <span className="w-28" role="columnheader">Role</span>
            <span className="w-24" role="columnheader">Hours a week</span>
            <span className="w-24" role="columnheader">Joined</span>
            <span className="w-16" />
          </div>
          {shown.length === 0 ? <p className="p-4 type-body-1 text-fg-secondary">{tab === "guests" ? "No guests yet. Invite someone as a guest to give them access to specific projects." : "No members."}</p> : null}
          {shown.map((m) => {
            const isMe = m.id === myId;
            const editable = canManage && !isMe && (m.role !== "owner" || myRole === "owner");
            return (
              <div key={m.id} role="row" className="flex min-w-[640px] h-12 items-center gap-3 border-b border-border px-4 last:border-b-0 hover:bg-hover">
                <span className="flex min-w-0 flex-1 items-center gap-3" role="cell">
                  <Avatar name={m.displayName} src={m.avatarUrl} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate type-body-1-strong">
                      {m.displayName}
                      {isMe ? <span className="ml-1 type-caption-1 font-normal text-fg-tertiary">(you)</span> : null}
                    </span>
                    <span className="block truncate type-caption-1 text-fg-secondary">{m.email}</span>
                  </span>
                </span>
                <span className="w-28" role="cell">
                  {editable ? (
                    <Menu>
                      <MenuTrigger asChild>
                        <button type="button" className="inline-flex h-7 items-center rounded-sm px-1 type-body-1 hover:bg-pressed" aria-label={`Role for ${m.displayName}: ${roleMeta[m.role].label}`}>
                          <Badge>{roleMeta[m.role].label}</Badge>
                        </button>
                      </MenuTrigger>
                      <MenuContent className="w-72">
                        <MenuRadioGroup value={m.role} onValueChange={(v) => changeRole(m, v as Role)}>
                          {(Object.keys(roleMeta) as Role[])
                            .filter((r) => r !== "owner" || myRole === "owner")
                            .map((r) => (
                              <MenuRadioItem key={r} value={r} className="h-auto py-1.5">
                                <span className="flex flex-col">
                                  <span>{roleMeta[r].label}</span>
                                  <span className="type-caption-1 text-fg-tertiary">{roleMeta[r].description}</span>
                                </span>
                              </MenuRadioItem>
                            ))}
                        </MenuRadioGroup>
                      </MenuContent>
                    </Menu>
                  ) : (
                    <Badge>{roleMeta[m.role].label}</Badge>
                  )}
                </span>
                <span className="w-24" role="cell">
                  <input
                    type="number"
                    min={0}
                    max={168}
                    step={1}
                    defaultValue={m.weeklyCapacityHours}
                    disabled={!canManage}
                    aria-label={`Weekly capacity for ${m.displayName}`}
                    onBlur={(e) => setCapacity(m, Number(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className={cn("h-7 w-16 rounded-sm border border-transparent bg-transparent px-1.5 text-right type-body-1 hover:border-border focus:border-brand focus:bg-surface focus:outline-none disabled:hover:border-transparent")}
                  />
                </span>
                <span className="w-24 type-caption-1 text-fg-secondary" role="cell">
                  {formatDateShort(m.joinedAt.slice(0, 10))}
                </span>
                <span className="flex w-16 justify-end" role="cell">
                  {editable ? (
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="subtle" size="sm" aria-label={`Actions for ${m.displayName}`}>
                          More
                        </Button>
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem onSelect={() => navigator.clipboard.writeText(m.email)}>Copy email</MenuItem>
                        <MenuSeparator />
                        <MenuItem destructive onSelect={() => remove(m)}>
                          Remove from workspace
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent
          title="Invite to the workspace"
          description="They get an email with a link. Guests only see the projects you add them to."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="invite-member" loading={pending} disabled={!email.includes("@")}>
                <Add20Regular className="h-4 w-4" /> Send invitation
              </Button>
            </>
          }
        >
          <form id="invite-member" onSubmit={invite} className="flex flex-col gap-4">
            <Field label="Email">
              <Input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
            </Field>
            <Field label="Role">
              <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-8 w-full rounded-sm border border-border-strong bg-surface px-2 type-body-1">
                {(Object.keys(roleMeta) as Role[])
                  .filter((r) => r !== "owner" || myRole === "owner")
                  .map((r) => (
                    <option key={r} value={r}>
                      {roleMeta[r].label}: {roleMeta[r].description}
                    </option>
                  ))}
              </select>
            </Field>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
