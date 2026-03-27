'use client';

import { useEffect, useState } from 'react';
import { User, Users, Key, Webhook, Copy, Trash2, Plus, Check } from 'lucide-react';

// Team, API Keys, and Webhooks are hidden for v1 launch.
// The underlying tab components remain implemented for post-launch activation.
// To restore: add the tab entries back to TABS and update TabId.
import {
  getMe,
  getOrg,
  getOrgMembers,
  inviteMember,
  removeMember,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  type OrgMember,
  type ApiKey,
  type ApiKeyCreated,
  type Webhook as WebhookType,
} from '../../../lib/offers-api';
import { useCurrentOrg, useHasOrgRole } from '../../../lib/org-context';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader, CardSection, CardFooter } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Alert } from '../../../components/ui/Alert';
import { cn } from '../../../lib/cn';

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabId = 'profile' | 'team' | 'api-keys' | 'webhooks';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <User className="w-3.5 h-3.5" aria-hidden="true" /> },
];

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const [me, setMe] = useState<{ userId: string; orgId: string; orgRole: string; role: string } | null>(null);
  const [org, setOrg] = useState<{ id: string; name: string; slug: string } | null>(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
    getOrg().then(setOrg).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <Alert variant="info">
        Profile details are managed through your identity provider. Contact support to update your email address.
      </Alert>
      <Card>
        <CardHeader title="Account" border />
        <CardSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="User ID" value={me?.userId ?? ''} disabled hint="Your unique account identifier" />
            <Input label="Role" value={me?.role ?? ''} disabled />
            <Input label="Organization" value={org?.name ?? ''} disabled />
            <Input label="Organization role" value={me?.orgRole ?? ''} disabled />
            <Input label="Organization slug" value={org?.slug ?? ''} disabled className="sm:col-span-2" />
          </div>
        </CardSection>
      </Card>
    </div>
  );
}

// ─── Team tab ─────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = ['MEMBER', 'ADMIN'] as const;
type InviteRole = (typeof ROLE_OPTIONS)[number];

function TeamTab() {
  const { orgId } = useCurrentOrg();
  const isAdmin = useHasOrgRole('ADMIN');

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    getOrgMembers(orgId)
      .then(setMembers)
      .catch(() => setError('Could not load team members.'))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await inviteMember(orgId, inviteEmail.trim(), inviteRole);
      setSuccess(`Invitation sent to ${inviteEmail.trim()}.`);
      setInviteEmail('');
      const updated = await getOrgMembers(orgId);
      setMembers(updated);
    } catch {
      setError('Could not send invitation. Please try again.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!orgId) return;
    setRemoving(userId);
    setError(null);
    try {
      await removeMember(orgId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {
      setError('Could not remove member. Please try again.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error" dismissible>{error}</Alert>}
      {success && <Alert variant="success" dismissible>{success}</Alert>}

      <Card>
        <CardHeader title="Team members" border />
        {loading ? (
          <div className="px-5 py-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton w-7 h-7 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-2.5 w-40 rounded bg-gray-200" />
                  <div className="skeleton h-2 w-24 rounded bg-gray-100" />
                </div>
                <div className="skeleton h-5 w-16 rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 px-5 py-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0 uppercase">
                  {(member.email ?? member.userId).slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{member.email ?? member.userId}</p>
                  {member.createdAt && (
                    <p className="text-[11px] text-[--color-text-muted] mt-0.5">
                      Joined {new Date(member.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <Badge variant={member.role === 'ADMIN' || member.role === 'OWNER' ? 'blue' : 'gray'} size="sm">
                  {member.role}
                </Badge>
                {isAdmin && member.role !== 'OWNER' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={removing === member.userId}
                    onClick={() => handleRemove(member.userId)}
                    aria-label={`Remove ${member.email ?? member.userId}`}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <CardFooter>
            <form onSubmit={handleInvite} className="flex items-end gap-3 w-full">
              <div className="flex-1">
                <Input
                  label="Invite by email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                  className="h-[38px] rounded-lg border border-[--color-border] text-xs px-3 bg-white focus:outline-none focus:ring-2 focus:ring-[--color-accent] focus:border-transparent"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={inviting}
                leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Invite
              </Button>
            </form>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

// ─── API Keys tab ─────────────────────────────────────────────────────────────

function ApiKeysTab() {
  const isAdmin = useHasOrgRole('ADMIN');

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyCreated, setNewKeyCreated] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    listApiKeys()
      .then(setKeys)
      .catch(() => setError('Could not load API keys.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createApiKey({ name: newKeyName.trim() });
      setNewKeyCreated(created);
      setNewKeyName('');
      setShowForm(false);
      const updated = await listApiKeys();
      setKeys(updated);
    } catch {
      setError('Could not create API key. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    setError(null);
    try {
      await deleteApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      setError('Could not delete API key. Please try again.');
    } finally {
      setDeleting(null);
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error" dismissible>{error}</Alert>}

      {newKeyCreated && (
        <Alert variant="success" dismissible>
          <div className="space-y-2">
            <p className="font-semibold text-xs">API key created — copy it now. It won't be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-green-100 rounded px-2 py-1 break-all">{newKeyCreated.key}</code>
              <button
                onClick={() => copyKey(newKeyCreated.key)}
                className="flex-shrink-0 text-green-700 hover:text-green-900 transition-colors"
                aria-label="Copy API key"
              >
                {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </Alert>
      )}

      <Card>
        <CardHeader
          title="API keys"
          description="Use API keys to authenticate server-to-server requests."
          border
          action={
            isAdmin && !showForm ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                onClick={() => setShowForm(true)}
              >
                New key
              </Button>
            ) : undefined
          }
        />

        {showForm && isAdmin && (
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <form onSubmit={handleCreate} className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label="Key name"
                  placeholder="e.g. Production server"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" variant="primary" size="sm" loading={creating}>Create</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            </form>
          </div>
        )}

        {loading ? (
          <div className="px-5 py-4 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-3 w-32 rounded bg-gray-200" />
                <div className="flex-1">
                  <div className="skeleton h-2.5 w-48 rounded bg-gray-100" />
                </div>
                <div className="skeleton h-6 w-16 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : keys.length === 0 ? (
          <p className="px-5 py-6 text-xs text-[--color-text-muted] text-center">No API keys yet. Create one to get started.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center gap-3 px-5 py-3">
                <Key className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900">{key.name}</p>
                  <p className="text-[11px] text-[--color-text-muted] mt-0.5 font-mono">{key.prefix}••••••••</p>
                </div>
                {key.lastUsedAt ? (
                  <span className="text-[11px] text-[--color-text-muted] hidden sm:block flex-shrink-0">
                    Last used {new Date(key.lastUsedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                ) : (
                  <span className="text-[11px] text-[--color-text-muted] hidden sm:block flex-shrink-0">Never used</span>
                )}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deleting === key.id}
                    onClick={() => handleDelete(key.id)}
                    aria-label={`Delete ${key.name}`}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── Webhooks tab ─────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  'offer.sent',
  'offer.accepted',
  'offer.declined',
  'offer.expired',
  'offer.revoked',
  'certificate.generated',
];

function WebhooksTab() {
  const isAdmin = useHasOrgRole('ADMIN');

  const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formUrl, setFormUrl] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>(['offer.accepted']);

  useEffect(() => {
    listWebhooks()
      .then(setWebhooks)
      .catch(() => setError('Could not load webhooks.'))
      .finally(() => setLoading(false));
  }, []);

  function startCreate() {
    setEditingId(null);
    setFormUrl('');
    setFormEvents(['offer.accepted']);
    setShowForm(true);
  }

  function startEdit(wh: WebhookType) {
    setEditingId(wh.id);
    setFormUrl(wh.url);
    setFormEvents(wh.events);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function toggleEvent(evt: string) {
    setFormEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt],
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formUrl.trim() || formEvents.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await updateWebhook(editingId, { url: formUrl.trim(), events: formEvents });
        setWebhooks((prev) => prev.map((w) => (w.id === editingId ? updated : w)));
        setSuccess('Webhook updated.');
      } else {
        const created = await createWebhook({ url: formUrl.trim(), events: formEvents });
        setWebhooks((prev) => [...prev, created]);
        setSuccess('Webhook created.');
      }
      cancelForm();
    } catch {
      setError('Could not save webhook. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    setError(null);
    try {
      await deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch {
      setError('Could not delete webhook. Please try again.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error" dismissible>{error}</Alert>}
      {success && <Alert variant="success" dismissible>{success}</Alert>}

      <Card>
        <CardHeader
          title="Webhooks"
          description="Receive real-time HTTP notifications for offer events."
          border
          action={
            isAdmin && !showForm ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                onClick={startCreate}
              >
                Add webhook
              </Button>
            ) : undefined
          }
        />

        {showForm && isAdmin && (
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <form onSubmit={handleSave} className="space-y-4">
              <Input
                label="Endpoint URL"
                type="url"
                placeholder="https://your-server.com/webhooks/offeraccept"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                required
                autoFocus
              />
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Events to subscribe</p>
                <div className="flex flex-wrap gap-2">
                  {WEBHOOK_EVENTS.map((evt) => (
                    <button
                      key={evt}
                      type="button"
                      onClick={() => toggleEvent(evt)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs border transition-colors',
                        formEvents.includes(evt)
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400',
                      )}
                    >
                      {evt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" variant="primary" size="sm" loading={saving}>
                  {editingId ? 'Save changes' : 'Create webhook'}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={cancelForm}>Cancel</Button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="px-5 py-4 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-3 w-56 rounded bg-gray-200" />
                <div className="flex-1">
                  <div className="skeleton h-2.5 w-32 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : webhooks.length === 0 && !showForm ? (
          <p className="px-5 py-6 text-xs text-[--color-text-muted] text-center">No webhooks configured yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {webhooks.map((wh) => (
              <li key={wh.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <Webhook className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate font-mono">{wh.url}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {wh.events.map((evt) => (
                        <span key={evt} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{evt}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(wh)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={deleting === wh.id}
                          onClick={() => handleDelete(wh.id)}
                          aria-label={`Delete webhook ${wh.url}`}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Settings" description="Manage your account." />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id
                ? 'border-[--color-accent] text-[--color-accent]'
                : 'border-transparent text-[--color-text-secondary] hover:text-gray-900 hover:border-gray-300',
            )}
            aria-selected={activeTab === tab.id}
            role="tab"
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'team' && <TeamTab />}
        {activeTab === 'api-keys' && <ApiKeysTab />}
        {activeTab === 'webhooks' && <WebhooksTab />}
      </div>
    </div>
  );
}
