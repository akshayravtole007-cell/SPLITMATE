'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, Users, ArrowRight, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { formatCurrency, GROUP_ICONS } from '@/lib/utils';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';

export default function GroupsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🏠');
  const [emails, setEmails] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data.groups);
    } catch {
      toast.error('Failed to load groups');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login');
    if (!loading && user) fetchGroups();
  }, [user, loading, router, fetchGroups]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const memberEmails = emails.split(',').map(e => e.trim()).filter(Boolean);
      const res = await api.post('/groups', { name, description, icon, memberEmails });
      toast.success('Group created!');
      setGroups(prev => [res.data.group, ...prev]);
      setShowCreate(false);
      setName(''); setDescription(''); setIcon('🏠'); setEmails('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  if (loading || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:pl-60">
      <Sidebar />
      <main className="pt-16 lg:pt-0 p-4 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Groups</h1>
            <p className="text-slate-500 text-sm mt-1">{groups.length} group{groups.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> New Group
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="card p-16 text-center animate-fade-in">
            <Users size={40} className="text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No groups yet</h3>
            <p className="text-slate-500 text-sm mb-6">Create a group to start splitting expenses with friends</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2">
              <Plus size={16} /> Create your first group
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groups.map((group, i) => (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className="card-hover p-6 block group animate-slide-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-2xl">
                    {group.icon}
                  </div>
                  <ArrowRight size={16} className="text-slate-600 group-hover:text-brand-400 transition-colors mt-1" />
                </div>
                <h3 className="font-semibold text-slate-100 text-lg mb-1">{group.name}</h3>
                {group.description && (
                  <p className="text-slate-500 text-sm mb-3 line-clamp-1">{group.description}</p>
                )}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800/60">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Users size={12} /> {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    {formatCurrency(parseFloat(group.total_spent || 0))} total
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Create Group Modal */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Group" size="md">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">Icon</label>
              <div className="flex flex-wrap gap-2">
                {GROUP_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                      icon === ic ? 'bg-brand-500/20 border-2 border-brand-500/60' : 'bg-slate-800 border-2 border-transparent hover:bg-slate-700'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Group name *</label>
              <input
                className="input-field"
                placeholder="Goa Trip, Flat Expenses..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">Description</label>
              <input
                className="input-field"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Add members by email</label>
              <textarea
                className="input-field h-20 resize-none"
                placeholder="friend1@example.com, friend2@example.com"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">Comma-separated. Members must already have accounts.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={creating || !name.trim()} className="btn-primary flex-1">
                {creating ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </form>
        </Modal>
      </main>
    </div>
  );
}
