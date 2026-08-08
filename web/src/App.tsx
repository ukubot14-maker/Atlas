import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type AtlasDirectoryUser,
  type BootstrapData,
  type ChannelMessages,
  type DirectConversation,
  type DirectConversationMessages,
  type AtlasRealtimeEvent,
} from './api'

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value))
    : 'No activity yet'

function App() {
  const [activeRail, setActiveRail] = useState<'home' | 'dm' | 'servers' | 'discover' | 'admin'>('home')
  const [data, setData] = useState<BootstrapData | null>(null)
  const [messages, setMessages] = useState<ChannelMessages['messages']>([])
  const [selectedServerId, setSelectedServerId] = useState('')
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [statusMessage, setStatusMessage] = useState('Loading Atlas...')
  const [draft, setDraft] = useState('')
  const [dmDraft, setDmDraft] = useState('')
  const [discoveryQuery, setDiscoveryQuery] = useState('')
  const [discoveryTag, setDiscoveryTag] = useState('')
  const [discoveryResults, setDiscoveryResults] = useState<BootstrapData['servers']>([])
  const [announceInput, setAnnounceInput] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [banUsername, setBanUsername] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banDuration, setBanDuration] = useState('7')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register')
  const [authUsername, setAuthUsername] = useState('')
  const [authDisplayName, setAuthDisplayName] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [directoryUsers, setDirectoryUsers] = useState<AtlasDirectoryUser[]>([])
  const [directConversations, setDirectConversations] = useState<DirectConversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [directMessages, setDirectMessages] = useState<DirectConversationMessages['messages']>([])
  const [selectedConversation, setSelectedConversation] = useState<DirectConversationMessages['conversation'] | null>(null)
  const [directUsernameInput, setDirectUsernameInput] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [showAdminUnlock, setShowAdminUnlock] = useState(false)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)
  const [currentAdminSecret, setCurrentAdminSecret] = useState('')
  const [nextAdminSecret, setNextAdminSecret] = useState('')
  const [confirmAdminSecret, setConfirmAdminSecret] = useState('')

  const selectedServer =
    data?.servers.find((server) => server.id === selectedServerId) ?? data?.servers[0] ?? null
  const selectedChannel =
    selectedServer?.channels.find((channel) => channel.id === selectedChannelId) ??
    selectedServer?.channels[0] ??
    null
  const adminEnabled = Boolean(
    data?.viewer && (data.viewer.role === 'owner' || data.viewer.adminUnlocked),
  )
  const headerTitle = useMemo(() => {
    if (activeRail === 'dm') {
      return selectedConversation ? `DM with ${selectedConversation.otherDisplayName}` : 'Direct Messages'
    }

    if (activeRail === 'servers') {
      return selectedChannel ? `#${selectedChannel.name}` : 'Servers'
    }

    if (activeRail === 'discover') {
      return 'Community Discovery'
    }

    if (activeRail === 'admin') {
      return 'Owner And Developer Panel'
    }

    return 'Atlas Command Center'
  }, [activeRail, selectedChannel, selectedConversation])

  const loadBootstrap = async () => {
    const bootstrap = await api.bootstrap()
    setData(bootstrap)
    setDiscoveryResults(bootstrap.servers)

    if (!selectedServerId || !bootstrap.servers.some((server) => server.id === selectedServerId)) {
      setSelectedServerId(bootstrap.servers[0]?.id ?? '')
      setSelectedChannelId(bootstrap.servers[0]?.channels[0]?.id ?? '')
    }

    return bootstrap
  }

  const loadDirectData = async () => {
    const [usersResponse, conversationsResponse] = await Promise.all([api.users(), api.directConversations()])
    setDirectoryUsers(usersResponse.users)
    setDirectConversations(conversationsResponse.conversations)

    if (!selectedConversationId && conversationsResponse.conversations[0]?.id) {
      setSelectedConversationId(conversationsResponse.conversations[0].id)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const sessionFromCallback = params.get('session')
        const authError = params.get('auth_error')

        if (sessionFromCallback) {
          window.localStorage.setItem('atlas-session', sessionFromCallback)
          window.history.replaceState({}, '', window.location.pathname)
        } else if (authError) {
          setStatusMessage(`Google sign-in failed: ${authError}`)
          window.history.replaceState({}, '', window.location.pathname)
        }

        const bootstrap = await loadBootstrap()

        if (bootstrap.viewer) {
          await loadDirectData()
          setActiveRail('dm')
        } else {
          setDirectoryUsers([])
          setDirectConversations([])
          setSelectedConversationId('')
          setSelectedConversation(null)
          setDirectMessages([])
          setActiveRail('home')
        }

        setStatusMessage(
          bootstrap.viewer
            ? `Signed in as ${bootstrap.viewer.displayName}.`
            : 'Sign in to participate, or browse Atlas as a guest.',
        )
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Could not load Atlas.')
      }
    }

    void load()
  }, [])

  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedChannelId) {
        setMessages([])
        return
      }

      try {
        const payload = await api.messages(selectedChannelId)
        setMessages(payload.messages)
      } catch {
        setMessages([])
      }
    }

    void loadMessages()
  }, [selectedChannelId])

  useEffect(() => {
    const loadConversation = async () => {
      if (!selectedConversationId || !data?.viewer) {
        setDirectMessages([])
        setSelectedConversation(null)
        return
      }

      try {
        const payload = await api.directMessages(selectedConversationId)
        setSelectedConversation(payload.conversation)
        setDirectMessages(payload.messages)
      } catch {
        setSelectedConversation(null)
        setDirectMessages([])
      }
    }

    void loadConversation()
  }, [data?.viewer, selectedConversationId])

  useEffect(() => {
    const run = async () => {
      if (!data) {
        return
      }

      try {
        const payload = await api.discovery(discoveryQuery, discoveryTag)
        setDiscoveryResults(payload.results)
      } catch {
        setDiscoveryResults(data.servers)
      }
    }

    void run()
  }, [data, discoveryQuery, discoveryTag])

  useEffect(() => {
    if (selectedServer && !selectedServer.channels.some((channel) => channel.id === selectedChannelId)) {
      setSelectedChannelId(selectedServer.channels[0]?.id ?? '')
    }
  }, [selectedChannelId, selectedServer])

  useEffect(() => {
    if (
      selectedConversationId &&
      !directConversations.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(directConversations[0]?.id ?? '')
    }
  }, [directConversations, selectedConversationId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F3' || !adminEnabled) {
        return
      }

      event.preventDefault()
      setAdminPanelOpen((current) => !current)
      setActiveRail('admin')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [adminEnabled])

  useEffect(() => {
    const websocket = new WebSocket(api.websocketUrl())

    websocket.onmessage = (event) => {
      const payload = JSON.parse(String(event.data)) as AtlasRealtimeEvent

      if (payload.type === 'connected') {
        return
      }

      if (payload.type === 'channel_message') {
        if (payload.channelId === selectedChannelId) {
          void api.messages(payload.channelId).then((response) => setMessages(response.messages))
        }

        void loadBootstrap()
        return
      }

      if (payload.type === 'direct_message') {
        if (payload.conversationId === selectedConversationId) {
          void api.directMessages(payload.conversationId).then((response) => {
            setSelectedConversation(response.conversation)
            setDirectMessages(response.messages)
          })
        }

        if (data?.viewer) {
          void loadDirectData()
        }

        return
      }

      if (payload.type === 'direct_conversation_created') {
        if (data?.viewer) {
          void loadDirectData()
        }

        return
      }

      if (payload.type === 'announcement' || payload.type === 'admin_action') {
        void loadBootstrap()
      }
    }

    return () => {
      websocket.close()
    }
  }, [data?.viewer, selectedChannelId, selectedConversationId])

  const clearAuthForm = () => {
    setAuthUsername('')
    setAuthDisplayName('')
    setAuthPassword('')
  }

  const openRail = (rail: 'home' | 'dm' | 'servers' | 'discover' | 'admin', label: string) => {
    setActiveRail(rail)
    setStatusMessage(label)
  }

  const handleRefreshPlatform = async () => {
    try {
      const bootstrap = await loadBootstrap()

      if (bootstrap.viewer) {
        await loadDirectData()
      }

      setStatusMessage('Atlas refreshed from local live data.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Refresh failed.')
    }
  }

  const handleAuth = async () => {
    try {
      const response =
        authMode === 'register'
          ? await api.register(authUsername.trim(), authDisplayName.trim(), authPassword)
          : await api.login(authUsername.trim(), authPassword)

      window.localStorage.setItem('atlas-session', response.sessionId)
      clearAuthForm()
      const bootstrap = await loadBootstrap()
      await loadDirectData()
      openRail('dm', `Signed in as ${bootstrap.viewer?.displayName ?? response.user.displayName}.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Authentication failed.')
    }
  }

  const handleLogout = () => {
    window.localStorage.removeItem('atlas-session')
    setDirectoryUsers([])
    setDirectConversations([])
    setSelectedConversationId('')
    setSelectedConversation(null)
    setDirectMessages([])
    void loadBootstrap()
    setStatusMessage('Signed out. You can still browse public communities.')
  }

  const handleSendMessage = async () => {
    if (!data?.viewer) {
      setStatusMessage('Sign in to send messages.')
      return
    }

    if (!selectedChannelId || !draft.trim()) {
      return
    }

    await api.sendMessage(selectedChannelId, draft.trim())
    const payload = await api.messages(selectedChannelId)
    setMessages(payload.messages)
    const bootstrap = await loadBootstrap()
    setStatusMessage(`Message posted as ${bootstrap.viewer?.displayName ?? data.viewer.displayName}.`)
    setDraft('')
  }

  const handleStartConversation = async () => {
    const normalizedUsername = directUsernameInput.trim().toLowerCase()

    if (!normalizedUsername) {
      return
    }

    const matchedUser = directoryUsers.find(
      (user) => user.username.toLowerCase() === normalizedUsername,
    )

    if (!matchedUser) {
      setStatusMessage('No account found with that username.')
      return
    }

    const payload = await api.createDirectConversation(matchedUser.id)
    await loadDirectData()
    setSelectedConversationId(payload.conversation.id)
    setDirectUsernameInput('')
    setActiveRail('dm')
    setStatusMessage(`Opened direct message with ${payload.conversation.otherDisplayName}.`)
  }

  const handleSendDirectMessage = async () => {
    if (!data?.viewer) {
      setStatusMessage('Sign in to send direct messages.')
      return
    }

    if (!selectedConversationId || !dmDraft.trim()) {
      return
    }

    await api.sendDirectMessage(selectedConversationId, dmDraft.trim())
    const payload = await api.directMessages(selectedConversationId)
    setSelectedConversation(payload.conversation)
    setDirectMessages(payload.messages)
    await loadDirectData()
    setDmDraft('')
    setStatusMessage(`Direct message sent to ${payload.conversation.otherDisplayName}.`)
  }

  const handleCompleteQuest = async (questId: string) => {
    if (!data?.viewer) {
      setStatusMessage('Sign in to complete quests.')
      return
    }

    try {
      const payload = await api.completeQuest(questId)
      setData({
        ...data,
        viewer: payload.viewer,
        quests: data.quests.map((quest) =>
          quest.id === questId ? { ...quest, completed: payload.quest.completed } : quest,
        ),
      })
      setStatusMessage(`Quest completed. ${payload.quest.reward} Atlas Coins added to your account.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Quest completion failed.')
    }
  }

  const handleAnnounce = async () => {
    if (!data?.viewer) {
      setStatusMessage('Owner account required.')
      return
    }

    if (!announceInput.trim()) {
      return
    }

    try {
      const payload = await api.announce(announceInput.trim())
      setData({
        ...data,
        announcements: payload.announcements,
        adminLogs: payload.adminLogs,
      })
      setAnnounceInput('')
      setStatusMessage('Announcement posted to the platform log.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Announcement failed.')
    }
  }

  const handleDeleteChannel = async () => {
    if (!selectedChannelId) {
      return
    }

    try {
      const payload = await api.deleteChannel(selectedChannelId, deleteReason.trim())
      setData(payload.bootstrap)
      const nextServer = payload.bootstrap.servers.find((server) => server.id === selectedServerId)
      setSelectedChannelId(nextServer?.channels[0]?.id ?? '')
      setDeleteReason('')
      setStatusMessage('Channel deleted from persistent storage.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Delete failed.')
    }
  }

  const handleBan = async () => {
    if (!banUsername.trim() || !data) {
      return
    }

    try {
      const payload = await api.banUser(banUsername.trim(), banReason.trim(), banDuration.trim())
      setData({
        ...data,
        adminLogs: payload.adminLogs,
      })
      setBanUsername('')
      setBanReason('')
      setBanDuration('7')
      setStatusMessage('Ban action recorded in admin logs.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Ban failed.')
    }
  }

  const handleAdminUnlock = async () => {
    if (!data?.viewer) {
      setStatusMessage('Sign in before unlocking admin controls.')
      return
    }

    try {
      const payload = await api.unlockAdmin(adminPassword)
      setData(
        data
          ? {
              ...data,
              viewer: payload.viewer,
            }
          : data,
      )
      setAdminPassword('')
      setShowAdminUnlock(false)
      setAdminPanelOpen(true)
      setActiveRail('admin')
      setStatusMessage('Admin controls unlocked for this session.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Admin unlock failed.')
    }
  }

  const handleRotateAdminSecret = async () => {
    if (!data?.viewer || data.viewer.role !== 'owner') {
      setStatusMessage('Only the owner account can rotate the admin unlock secret.')
      return
    }

    if (!currentAdminSecret || !nextAdminSecret) {
      setStatusMessage('Enter the current and new admin password.')
      return
    }

    if (nextAdminSecret !== confirmAdminSecret) {
      setStatusMessage('The new admin password confirmation does not match.')
      return
    }

    try {
      await api.rotateAdminUnlockSecret(currentAdminSecret, nextAdminSecret)
      setCurrentAdminSecret('')
      setNextAdminSecret('')
      setConfirmAdminSecret('')
      setStatusMessage('Admin unlock password rotated and unlocked sessions were cleared.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not rotate the admin password.')
    }
  }

  return (
    <div className="app-shell">
      <div className="app-layout">
        <aside className="product-rail">
          <div className="rail-brand">
            <div className="rail-logo">A</div>
            <div>
              <p className="eyebrow">Atlas</p>
              <strong>Workspace</strong>
            </div>
          </div>
          <div className="rail-nav">
            <button
              type="button"
              className={`rail-item ${activeRail === 'home' ? 'rail-item-active' : ''}`}
              onClick={() => openRail('home', 'Showing Atlas overview.')}
            >
              Home
            </button>
            <button
              type="button"
              className={`rail-item ${activeRail === 'dm' ? 'rail-item-active' : ''}`}
              onClick={() =>
                openRail('dm', data?.viewer ? 'Showing direct messages.' : 'Sign in to use direct messages.')
              }
            >
              Direct Messages
            </button>
            <button
              type="button"
              className={`rail-item ${activeRail === 'servers' ? 'rail-item-active' : ''}`}
              onClick={() => openRail('servers', 'Showing community servers.')}
            >
              Servers
            </button>
            <button
              type="button"
              className={`rail-item ${activeRail === 'discover' ? 'rail-item-active' : ''}`}
              onClick={() => openRail('discover', 'Showing public community discovery.')}
            >
              Discover
            </button>
            <button
              type="button"
              className={`rail-item ${activeRail === 'admin' ? 'rail-item-active' : ''}`}
              onClick={() =>
                openRail(
                  'admin',
                  adminEnabled ? 'Showing admin controls.' : 'Admin controls require owner access or crown unlock.',
                )
              }
            >
              Admin
            </button>
          </div>
          <div className="rail-summary">
            <span>Signed in</span>
            <strong>{data?.viewer ? data.viewer.displayName : 'Guest mode'}</strong>
            <span>{directConversations.length} DMs</span>
            <span>{data?.servers.length ?? 0} servers</span>
          </div>
        </aside>

        <div className="main-shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">Atlas</p>
              <h1>{headerTitle}</h1>
            </div>
            <div className="topbar-actions">
              <button type="button" className="crown-button" onClick={() => setShowAdminUnlock((current) => !current)}>
                👑
              </button>
              <div className="viewer-chip">
                <span className="viewer-label">Session</span>
                <strong>
                  {data?.viewer
                    ? `${data.viewer.displayName} (${data.viewer.adminUnlocked || data.viewer.role === 'owner' ? 'admin' : data.viewer.role})`
                    : 'Guest'}
                </strong>
              </div>
            </div>
          </header>

          {showAdminUnlock ? (
            <section className="unlock-bar">
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="Enter admin password"
              />
              <button type="button" onClick={() => void handleAdminUnlock()}>
                Unlock admin
              </button>
            </section>
          ) : null}

          <section id="hero-section" className={`hero-grid ${activeRail !== 'home' ? 'view-hidden' : ''}`}>
        <article className="hero-copy">
          <div className="hero-copy-head">
            <p className="eyebrow">Platform Overview</p>
            <span className="status-pill">{data?.product.status ?? 'Loading'}</span>
          </div>
          <p className="hero-text">
            Atlas now supports account-based direct messaging alongside community chat. Signed-in
            users can open one-to-one conversations, view message history, and send private messages
            through the same persistent backend.
          </p>
          <div className="metric-grid">
            <div className="metric-card">
              <span>Communities</span>
              <strong>{data?.servers.length ?? 0}</strong>
            </div>
            <div className="metric-card">
              <span>Direct conversations</span>
              <strong>{directConversations.length}</strong>
            </div>
            <div className="metric-card">
              <span>Viewer coins</span>
              <strong>{data?.viewer?.atlasCoins ?? 0}</strong>
            </div>
          </div>
          <div className="notice-bar">{statusMessage}</div>
          <div className="action-stack">
            {(data?.quests ?? []).map((quest) => (
              <article key={quest.id} className="action-card">
                <p>
                  <strong>{quest.title}</strong>
                </p>
                <small>
                  {quest.description} | Reward: {quest.reward} coins
                </small>
                <button
                  type="button"
                  className={quest.completed ? 'secondary small-button' : 'small-button'}
                  onClick={() => void handleCompleteQuest(quest.id)}
                  disabled={!data?.viewer || Boolean(quest.completed)}
                >
                  {quest.completed ? 'Completed' : 'Claim quest'}
                </button>
              </article>
            ))}
          </div>
        </article>

        <aside className="hero-card auth-card">
          <div className="auth-header">
            <div>
              <p className="eyebrow">Access</p>
              <h2>{authMode === 'register' ? 'Create Atlas Account' : 'Sign In'}</h2>
            </div>
            <div className="auth-toggle">
              <button type="button" className={authMode === 'register' ? 'tab-active' : 'secondary'} onClick={() => setAuthMode('register')}>
                Register
              </button>
              <button type="button" className={authMode === 'login' ? 'tab-active' : 'secondary'} onClick={() => setAuthMode('login')}>
                Login
              </button>
            </div>
          </div>
          <div className="form-stack">
            <input value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} placeholder="Username" />
            {authMode === 'register' ? (
              <input
                value={authDisplayName}
                onChange={(event) => setAuthDisplayName(event.target.value)}
                placeholder="Display name"
              />
            ) : null}
            <input
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="Password"
            />
            <button type="button" onClick={() => void handleAuth()}>
              {authMode === 'register' ? 'Create account' : 'Sign in'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => (window.location.href = api.googleAuthStartUrl())}
            >
              Continue with Google
            </button>
            {data?.viewer ? (
              <button type="button" className="secondary" onClick={handleLogout}>
                Sign out
              </button>
            ) : null}
          </div>
          <p className="section-copy">Owner account credentials are configured locally on this machine.</p>
        </aside>
          </section>

          <main className={`workspace-grid workspace-grid-dm ${activeRail !== 'dm' && activeRail !== 'servers' ? 'view-hidden' : ''}`}>
        <section id="dm-section" className={`panel ${activeRail !== 'dm' ? 'view-hidden' : ''}`}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Direct Messages</p>
              <h2>Inbox</h2>
            </div>
            <span>{directConversations.length} threads</span>
          </div>
          {data?.viewer ? (
            <>
              <div className="form-stack">
                <input
                  value={directUsernameInput}
                  onChange={(event) => setDirectUsernameInput(event.target.value)}
                  placeholder="Type a username to start a new DM"
                  autoComplete="off"
                />
                <p className="section-copy">Only people you have already messaged appear in the inbox below.</p>
                <button type="button" onClick={() => void handleStartConversation()} disabled={!directUsernameInput.trim()}>
                  Open direct message
                </button>
              </div>
              <div className="server-list">
                {directConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    className={`server-card ${selectedConversationId === conversation.id ? 'server-card-active' : ''}`}
                    onClick={() => {
                      setSelectedConversationId(conversation.id)
                      setActiveRail('dm')
                    }}
                  >
                    <div className="server-avatar dm-avatar">{conversation.otherDisplayName.slice(0, 1)}</div>
                    <div className="server-copy">
                      <strong>{conversation.otherDisplayName}</strong>
                      <p>{conversation.lastMessage ?? 'No messages yet'}</p>
                    </div>
                    <span className="server-tag server-tag-muted">{formatDate(conversation.lastMessageAt)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="section-copy">Sign in to view and send direct messages.</p>
          )}
        </section>

        <section className={`panel panel-wide ${activeRail !== 'dm' ? 'view-hidden' : ''}`}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Private Conversation</p>
              <h2>{selectedConversation ? selectedConversation.otherDisplayName : 'Select a direct message'}</h2>
            </div>
            <span>{directMessages.length} messages</span>
          </div>
          <p className="section-copy">
            {selectedConversation
              ? `Direct conversation with @${selectedConversation.otherUsername}`
              : 'Choose a conversation from the inbox or start a new one.'}
          </p>
          <div className="message-list">
            {directMessages.map((message) => (
              <article key={message.id} className="message-card">
                <div className="message-avatar">{message.author.displayName.slice(0, 1)}</div>
                <div className="message-body">
                  <p className="message-meta">
                    <strong>{message.author.displayName}</strong>
                    <span>{formatDate(message.createdAt)}</span>
                  </p>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="composer-box">
            <textarea
              rows={3}
              value={dmDraft}
              onChange={(event) => setDmDraft(event.target.value)}
              placeholder={data?.viewer ? 'Write a direct message' : 'Sign in to send direct messages'}
              disabled={!data?.viewer || !selectedConversationId}
            />
            <button
              type="button"
              onClick={() => void handleSendDirectMessage()}
              disabled={!data?.viewer || !selectedConversationId}
            >
              Send direct message
            </button>
          </div>
        </section>

        <section id="servers-section" className={`panel ${activeRail !== 'servers' ? 'view-hidden' : ''}`}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Communities</p>
              <h2>Servers</h2>
            </div>
            <span>{data?.servers.length ?? 0} active</span>
          </div>
          <div className="server-list">
            {(data?.servers ?? []).map((server) => (
              <button
                key={server.id}
                type="button"
                className={`server-card ${selectedServerId === server.id ? 'server-card-active' : ''}`}
                onClick={() => {
                  setSelectedServerId(server.id)
                  setSelectedChannelId(server.channels[0]?.id ?? '')
                  setActiveRail('servers')
                }}
              >
                <div className="server-avatar" style={{ background: `linear-gradient(135deg, ${server.accent}, #5da9ff)` }}>
                  {server.name.slice(0, 1)}
                </div>
                <div className="server-copy">
                  <strong>{server.name}</strong>
                  <p>{server.memberCount} members</p>
                </div>
                <span className="server-tag">{server.category}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={`panel ${activeRail !== 'servers' ? 'view-hidden' : ''}`}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Community Chat</p>
              <h2>#{selectedChannel?.name ?? 'channel'}</h2>
            </div>
            <span>{messages.length} stored messages</span>
          </div>
          <p className="section-copy">{selectedChannel?.topic}</p>
          <div className="message-list message-list-compact">
            {messages.map((message) => (
              <article key={message.id} className="message-card">
                <div className="message-avatar">{message.author.displayName.slice(0, 1)}</div>
                <div className="message-body">
                  <p className="message-meta">
                    <strong>{message.author.displayName}</strong>
                    <span>{formatDate(message.createdAt)}</span>
                  </p>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="composer-box">
            <textarea
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={data?.viewer ? `Message #${selectedChannel?.name ?? 'channel'}` : 'Sign in to send messages'}
              disabled={!data?.viewer}
            />
            <button type="button" onClick={() => void handleSendMessage()} disabled={!data?.viewer}>
              Send message
            </button>
          </div>
        </section>
          </main>

          <section className={`admin-grid ${activeRail !== 'discover' && activeRail !== 'admin' ? 'view-hidden' : ''}`}>
        <section id="discover-section" className={`panel ${activeRail !== 'discover' ? 'view-hidden' : ''}`}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Discovery</p>
              <h2>Public communities</h2>
            </div>
            <span>{discoveryResults.length} results</span>
          </div>
          <div className="form-stack">
            <input
              value={discoveryQuery}
              onChange={(event) => setDiscoveryQuery(event.target.value)}
              placeholder="Search communities"
            />
            <select value={discoveryTag} onChange={(event) => setDiscoveryTag(event.target.value)}>
              <option value="">All tags</option>
              {(data?.discovery.categories ?? []).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              {(data?.discovery.tags ?? []).map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div className="discovery-list">
            {discoveryResults.map((server) => (
              <article key={server.id} className="discovery-card">
                <div className="map-badge">{server.category}</div>
                <h3>{server.name}</h3>
                <p>{server.description}</p>
                <small>{server.memberCount} members | {server.tags.join(' | ')}</small>
              </article>
            ))}
          </div>
        </section>

        <section id="admin-section" className={`panel ${activeRail !== 'admin' ? 'view-hidden' : ''}`}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Broadcasts</p>
              <h2>Announcements</h2>
            </div>
            <span>{data?.announcements.length ?? 0} recent</span>
          </div>
          <div className="form-stack">
            <textarea
              rows={3}
              value={announceInput}
              onChange={(event) => setAnnounceInput(event.target.value)}
              placeholder="Global announcement"
              disabled={!adminEnabled}
            />
            <button type="button" onClick={() => void handleAnnounce()} disabled={!adminEnabled}>
              Post announcement
            </button>
          </div>
          <div className="action-stack">
            {(data?.announcements ?? []).map((announcement) => (
              <article key={announcement.id} className="action-card">
                <p>{announcement.message}</p>
                <small>
                  {announcement.author} | {formatDate(announcement.createdAt)}
                </small>
              </article>
            ))}
          </div>
        </section>

        <section className={`panel ${activeRail !== 'admin' ? 'view-hidden' : ''}`}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Moderation</p>
              <h2>Owner controls</h2>
            </div>
            <span>{data?.viewer?.role === 'owner' || data?.viewer?.adminUnlocked ? 'Enabled' : 'Restricted'}</span>
          </div>
          <div className="form-stack">
            <input
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder={`Delete reason for #${selectedChannel?.name ?? 'channel'}`}
              disabled={!data?.viewer || (!data.viewer.adminUnlocked && data.viewer.role !== 'owner')}
            />
            <button
              type="button"
              className="danger-button"
              onClick={() => void handleDeleteChannel()}
              disabled={!data?.viewer || (!data.viewer.adminUnlocked && data.viewer.role !== 'owner')}
            >
              Delete current channel
            </button>
            <input
              value={banUsername}
              onChange={(event) => setBanUsername(event.target.value)}
              placeholder="Username"
              disabled={!data?.viewer || (!data.viewer.adminUnlocked && data.viewer.role !== 'owner')}
            />
            <input
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              placeholder="Reason"
              disabled={!data?.viewer || (!data.viewer.adminUnlocked && data.viewer.role !== 'owner')}
            />
            <input
              value={banDuration}
              onChange={(event) => setBanDuration(event.target.value)}
              placeholder="Days or forever"
              disabled={!data?.viewer || (!data.viewer.adminUnlocked && data.viewer.role !== 'owner')}
            />
            <button
              type="button"
              className="danger-button"
              onClick={() => void handleBan()}
              disabled={!data?.viewer || (!data.viewer.adminUnlocked && data.viewer.role !== 'owner')}
            >
              Ban user
            </button>
          </div>
        </section>
        <section className={`panel ${activeRail !== 'admin' ? 'view-hidden' : ''}`}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Security</p>
              <h2>Rotate admin unlock password</h2>
            </div>
            <span>{data?.viewer?.role === 'owner' ? 'Owner only' : 'Restricted'}</span>
          </div>
          <div className="form-stack">
            <input
              type="password"
              value={currentAdminSecret}
              onChange={(event) => setCurrentAdminSecret(event.target.value)}
              placeholder="Current admin password"
              disabled={data?.viewer?.role !== 'owner'}
            />
            <input
              type="password"
              value={nextAdminSecret}
              onChange={(event) => setNextAdminSecret(event.target.value)}
              placeholder="New admin password"
              disabled={data?.viewer?.role !== 'owner'}
            />
            <input
              type="password"
              value={confirmAdminSecret}
              onChange={(event) => setConfirmAdminSecret(event.target.value)}
              placeholder="Confirm new admin password"
              disabled={data?.viewer?.role !== 'owner'}
            />
            <button
              type="button"
              onClick={() => void handleRotateAdminSecret()}
              disabled={data?.viewer?.role !== 'owner'}
            >
              Rotate admin password
            </button>
          </div>
        </section>
          </section>
        </div>
      </div>
      {adminPanelOpen && adminEnabled ? (
        <div className="admin-overlay" role="dialog" aria-modal="true">
          <section className="admin-command-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">F3 Console</p>
                <h2>Owner / Developer Panel</h2>
              </div>
              <button type="button" className="secondary small-button" onClick={() => setAdminPanelOpen(false)}>
                Close
              </button>
            </div>
            <p className="section-copy">
              This console shows the real commands available in Atlas right now. Press `F3` again any time to reopen it.
            </p>
            <div className="command-grid">
              <button type="button" onClick={() => void handleRefreshPlatform()}>
                Refresh platform
              </button>
              <button type="button" onClick={() => openRail('admin', 'Showing admin controls.')}>
                Open admin view
              </button>
              <button type="button" onClick={() => openRail('servers', 'Showing community servers.')}>
                Open server view
              </button>
              <button type="button" onClick={() => openRail('dm', 'Showing direct messages.')}>
                Open DM view
              </button>
            </div>
            <div className="command-reference">
              <article className="action-card">
                <p>
                  <strong>Available owner commands</strong>
                </p>
                <small>
                  Global announcements, delete current channel, ban users, inspect admin logs, refresh live data,
                  rotate the admin unlock password.
                </small>
              </article>
              <article className="action-card">
                <p>
                  <strong>Session</strong>
                </p>
                <small>
                  {data?.viewer?.displayName ?? 'Guest'} | role: {data?.viewer?.role ?? 'guest'} | admin unlocked:{' '}
                  {data?.viewer?.adminUnlocked ? 'yes' : 'no'}
                </small>
              </article>
              <article className="action-card">
                <p>
                  <strong>Platform snapshot</strong>
                </p>
                <small>
                  servers: {data?.servers.length ?? 0} | DMs: {directConversations.length} | announcements:{' '}
                  {data?.announcements.length ?? 0} | logs: {data?.adminLogs.length ?? 0}
                </small>
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App
