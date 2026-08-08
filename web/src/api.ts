export type BootstrapData = {
  product: {
    name: string
    status: string
    phase: string
    mission: string
    pillars: string[]
    roadmap: string[]
  }
  viewer: {
    id: string
    username: string
    displayName: string
    role: string
    atlasCoins: number
    adminUnlocked?: boolean
  } | null
  quests: Array<{
    id: string
    title: string
    description: string
    reward: number
    completed: number | boolean
  }>
  servers: Array<{
    id: string
    name: string
    description: string
    category: string
    accent: string
    memberCount: number
    channelCount: number
    messageCount: number
    tags: string[]
    channels: Array<{
      id: string
      name: string
      topic: string
      messageCount: number
    }>
  }>
  announcements: Array<{
    id: string
    message: string
    createdAt: string
    author: string
  }>
  adminLogs: Array<{
    id: string
    action: string
    target: string
    reason: string
    durationDays: string
    createdAt: string
    actor: string
  }>
  discovery: {
    categories: string[]
    tags: string[]
  }
}

export type AtlasMessage = {
  id: string
  content: string
  createdAt: string
  author: {
    id: string
    username: string
    displayName: string
  }
}

export type ChannelMessages = {
  channel: {
    id: string
    name: string
    topic: string
    serverId: string
    serverName: string
  }
  messages: AtlasMessage[]
}

export type DirectConversation = {
  id: string
  lastMessage: string | null
  lastMessageAt: string | null
  otherUserId: string
  otherUsername: string
  otherDisplayName: string
}

export type DirectConversationMessages = {
  conversation: {
    id: string
    otherUserId: string
    otherUsername: string
    otherDisplayName: string
  }
  messages: AtlasMessage[]
}

export type AtlasDirectoryUser = {
  id: string
  username: string
  displayName: string
  role: string
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const sessionId = window.localStorage.getItem('atlas-session')
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''
  const url = input.startsWith('http://') || input.startsWith('https://') ? input : `${apiBaseUrl}${input}`
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'X-Atlas-Session': sessionId } : {}),
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(error?.error ?? 'Request failed.')
  }

  return (await response.json()) as T
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''
const originBaseUrl = apiBaseUrl || window.location.origin

export type AtlasRealtimeEvent =
  | { type: 'connected' }
  | { type: 'channel_message'; channelId: string; serverId: string }
  | { type: 'direct_message'; conversationId: string }
  | { type: 'direct_conversation_created'; conversationId: string; userIds: string[] }
  | { type: 'announcement' }
  | { type: 'admin_action'; action: string }

export const api = {
  googleAuthStartUrl: () => `${apiBaseUrl}/api/auth/google/start`,
  websocketUrl: () => {
    const wsOrigin = originBaseUrl.replace(/^http/, 'ws')
    const sessionId = window.localStorage.getItem('atlas-session')
    const url = new URL('/ws', wsOrigin)

    if (sessionId) {
      url.searchParams.set('session', sessionId)
    }

    return url.toString()
  },
  session: () => request<{ viewer: BootstrapData['viewer'] }>('/api/auth/session'),
  register: (username: string, displayName: string, password: string) =>
    request<{
      sessionId: string
      user: NonNullable<BootstrapData['viewer']>
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password }),
    }),
  login: (username: string, password: string) =>
    request<{
      sessionId: string
      user: NonNullable<BootstrapData['viewer']>
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  bootstrap: () => request<BootstrapData>('/api/bootstrap'),
  discovery: (query: string, tag: string) =>
    request<{ results: BootstrapData['servers'] }>(
      `/api/discovery?query=${encodeURIComponent(query)}&tag=${encodeURIComponent(tag)}`,
    ),
  users: () => request<{ users: AtlasDirectoryUser[] }>('/api/users'),
  directConversations: () => request<{ conversations: DirectConversation[] }>('/api/direct-messages'),
  createDirectConversation: (targetUserId: string) =>
    request<{ conversation: DirectConversationMessages['conversation'] }>('/api/direct-messages', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    }),
  unlockAdmin: (password: string) =>
    request<{ viewer: BootstrapData['viewer'] }>('/api/admin/unlock', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  rotateAdminUnlockSecret: (currentPassword: string, nextPassword: string) =>
    request<{ ok: true; rotatedAt: string }>('/api/admin/rotate-unlock-secret', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, nextPassword }),
    }),
  directMessages: (conversationId: string) =>
    request<DirectConversationMessages>(`/api/direct-messages/${conversationId}/messages`),
  sendDirectMessage: (conversationId: string, content: string) =>
    request(`/api/direct-messages/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  messages: (channelId: string) => request<ChannelMessages>(`/api/channels/${channelId}/messages`),
  sendMessage: (channelId: string, content: string) =>
    request(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  completeQuest: (questId: string) =>
    request<{ viewer: BootstrapData['viewer']; quest: BootstrapData['quests'][number] }>(
      `/api/quests/${questId}/complete`,
      {
        method: 'POST',
      },
    ),
  announce: (message: string) =>
    request<{ announcements: BootstrapData['announcements']; adminLogs: BootstrapData['adminLogs'] }>(
      '/api/admin/announce',
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      },
    ),
  deleteChannel: (channelId: string, reason: string) =>
    request<{ bootstrap: BootstrapData }>('/api/admin/delete-channel', {
      method: 'POST',
      body: JSON.stringify({ channelId, reason }),
    }),
  banUser: (username: string, reason: string, durationDays: string) =>
    request<{ adminLogs: BootstrapData['adminLogs'] }>('/api/admin/ban', {
      method: 'POST',
      body: JSON.stringify({ username, reason, durationDays }),
    }),
}
