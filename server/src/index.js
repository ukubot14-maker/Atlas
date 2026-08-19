import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { db } from './db.js'
import { hashPassword, verifyPassword } from './auth.js'
import { config } from './config.js'
import './seed.js'

const port = Number(process.env.PORT ?? 3001)
const appOrigin = config.appOrigin
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? ''
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/api/auth/google/callback'
const googleStateStore = new Map()
const rateLimitStore = new Map()
const websocketClients = new Set()
const authRateLimit = { windowMs: 15 * 60 * 1000, maxRequests: 25 }
const adminRateLimit = { windowMs: 10 * 60 * 1000, maxRequests: 40 }
const writeRateLimit = { windowMs: 60 * 1000, maxRequests: 45 }
const websocketMagic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const sendJson = (response, status, payload) => {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(payload))
}

const parseBody = async (request) => {
  const chunks = []
  let totalLength = 0

  for await (const chunk of request) {
    totalLength += chunk.length

    if (totalLength > config.maxBodySizeBytes) {
      throw new Error('Request body too large.')
    }

    chunks.push(chunk)
  }

  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`
const now = () => new Date().toISOString()
const getClientAddress = (request) =>
  String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown')
    .split(',')[0]
    .trim()

const product = {
  name: 'Atlas',
  status: 'serious local prototype',
  phase: 'accounts and real data foundation',
  mission:
    'A community-first platform with honest metrics, flexible organization, and free core functionality.',
  pillars: [
    'Real communities with persistent data',
    'Account creation and session-based identity',
    'Discovery through tags and categories',
    'Built-in community tools instead of paywalled basics',
  ],
  roadmap: [
    'Persistent accounts, communities, channels, and text chat',
    'Search, quests, announcements, and moderation history',
    'Voice, file uploads, bot builder, and mobile clients',
  ],
}

const viewerQuery = db.prepare(`
  SELECT id, username, display_name AS displayName, role, atlas_coins AS atlasCoins
  FROM users
  WHERE id = ?
`)

const userByUsernameQuery = db.prepare(`
  SELECT id, username, display_name AS displayName, role, atlas_coins AS atlasCoins, password_hash AS passwordHash
  FROM users
  WHERE lower(username) = lower(?)
`)

const bootstrapServersQuery = db.prepare(`
  SELECT
    s.id,
    s.name,
    s.description,
    s.category,
    s.accent,
    s.is_public AS isPublic,
    COUNT(DISTINCT sm.user_id) AS memberCount,
    COUNT(DISTINCT c.id) AS channelCount,
    COUNT(DISTINCT m.id) AS messageCount
  FROM servers s
  LEFT JOIN server_members sm ON sm.server_id = s.id
  LEFT JOIN channels c ON c.server_id = s.id
  LEFT JOIN messages m ON m.channel_id = c.id
  GROUP BY s.id
  ORDER BY s.name
`)

const tagsByServerQuery = db.prepare(`
  SELECT server_id AS serverId, tag
  FROM server_tags
  ORDER BY tag
`)

const channelsByServerQuery = db.prepare(`
  SELECT
    c.id,
    c.server_id AS serverId,
    c.name,
    c.topic,
    c.position,
    COUNT(m.id) AS messageCount
  FROM channels c
  LEFT JOIN messages m ON m.channel_id = c.id
  GROUP BY c.id
  ORDER BY c.position, c.name
`)

const messagesQuery = db.prepare(`
  SELECT
    m.id,
    m.content,
    m.created_at AS createdAt,
    u.id AS authorId,
    u.username,
    u.display_name AS displayName
  FROM messages m
  JOIN users u ON u.id = m.author_id
  WHERE m.channel_id = ?
  ORDER BY m.created_at
`)

const channelDetailsQuery = db.prepare(`
  SELECT c.id, c.name, c.topic, s.id AS serverId, s.name AS serverName
  FROM channels c
  JOIN servers s ON s.id = c.server_id
  WHERE c.id = ?
`)

const announcementsQuery = db.prepare(`
  SELECT a.id, a.message, a.created_at AS createdAt, u.display_name AS author
  FROM announcements a
  JOIN users u ON u.id = a.author_id
  ORDER BY a.created_at DESC
  LIMIT 5
`)

const adminLogsQuery = db.prepare(`
  SELECT
    l.id,
    l.action,
    l.target,
    l.reason,
    l.duration_days AS durationDays,
    l.created_at AS createdAt,
    u.display_name AS actor
  FROM admin_logs l
  JOIN users u ON u.id = l.actor_id
  ORDER BY l.created_at DESC
  LIMIT 10
`)

const questQuery = db.prepare(`
  SELECT
    q.id,
    q.title,
    q.description,
    q.reward,
    CASE WHEN uqc.user_id IS NULL THEN 0 ELSE 1 END AS completed
  FROM quests q
  LEFT JOIN user_quest_completions uqc
    ON uqc.quest_id = q.id
   AND uqc.user_id = ?
  ORDER BY q.title
`)

const sessionUserQuery = db.prepare(`
  SELECT
    u.id,
    u.username,
    u.display_name AS displayName,
    u.role,
    u.atlas_coins AS atlasCoins,
    s.admin_unlocked AS adminUnlocked
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = ?
`)

const createUserQuery = db.prepare(`
  INSERT INTO users (id, username, display_name, role, atlas_coins, created_at, password_hash)
  VALUES (?, ?, ?, 'member', 0, ?, ?)
`)
const createGoogleUserQuery = db.prepare(`
  INSERT INTO users (id, username, display_name, role, atlas_coins, created_at, password_hash)
  VALUES (?, ?, ?, 'member', 0, ?, '')
`)
const createAuthIdentityQuery = db.prepare(`
  INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_email, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const authIdentityQuery = db.prepare(`
  SELECT user_id AS userId
  FROM auth_identities
  WHERE provider = ? AND provider_user_id = ?
`)

const addMembershipQuery = db.prepare(`
  INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at)
  VALUES (?, ?, ?)
`)

const insertSessionQuery = db.prepare(`
  INSERT INTO sessions (id, user_id, created_at)
  VALUES (?, ?, ?)
`)
const unlockSessionQuery = db.prepare(`
  UPDATE sessions
  SET admin_unlocked = 1
  WHERE id = ?
`)
const resetUnlockedSessionsQuery = db.prepare(`
  UPDATE sessions
  SET admin_unlocked = 0
`)
const adminSecretQuery = db.prepare(`
  SELECT value, updated_at AS updatedAt
  FROM app_secrets
  WHERE key = 'admin_unlock_hash'
`)
const upsertAdminSecretQuery = db.prepare(`
  INSERT INTO app_secrets (key, value, updated_at)
  VALUES ('admin_unlock_hash', ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`)

const deleteChannelQuery = db.prepare(`DELETE FROM channels WHERE id = ?`)
const deleteChannelMessagesQuery = db.prepare(`DELETE FROM messages WHERE channel_id = ?`)
const insertMessageQuery = db.prepare(`
  INSERT INTO messages (id, channel_id, author_id, content, created_at)
  VALUES (?, ?, ?, ?, ?)
`)
const insertQuestCompletionQuery = db.prepare(`
  INSERT OR IGNORE INTO user_quest_completions (user_id, quest_id, completed_at)
  VALUES (?, ?, ?)
`)
const incrementCoinsQuery = db.prepare(`UPDATE users SET atlas_coins = atlas_coins + ? WHERE id = ?`)
const insertAnnouncementQuery = db.prepare(`
  INSERT INTO announcements (id, author_id, message, created_at)
  VALUES (?, ?, ?, ?)
`)
const insertAdminLogQuery = db.prepare(`
  INSERT INTO admin_logs (id, actor_id, action, target, reason, duration_days, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)
const usersDirectoryQuery = db.prepare(`
  SELECT id, username, display_name AS displayName, role
  FROM users
  WHERE id != ?
  ORDER BY display_name
`)
const questByIdQuery = db.prepare(`
  SELECT id, title, description, reward
  FROM quests
  WHERE id = ?
`)
const questCompletionQuery = db.prepare(`
  SELECT 1 AS completed
  FROM user_quest_completions
  WHERE user_id = ? AND quest_id = ?
`)
const directConversationsQuery = db.prepare(`
  SELECT
    dc.id,
    dm.content AS lastMessage,
    dm.created_at AS lastMessageAt,
    u.id AS otherUserId,
    u.username AS otherUsername,
    u.display_name AS otherDisplayName
  FROM direct_conversations dc
  JOIN direct_conversation_participants dcp_self
    ON dcp_self.conversation_id = dc.id
  JOIN direct_conversation_participants dcp_other
    ON dcp_other.conversation_id = dc.id
   AND dcp_other.user_id != dcp_self.user_id
  JOIN users u
    ON u.id = dcp_other.user_id
  LEFT JOIN direct_messages dm
    ON dm.id = (
      SELECT id
      FROM direct_messages
      WHERE conversation_id = dc.id
      ORDER BY created_at DESC
      LIMIT 1
    )
  WHERE dcp_self.user_id = ?
  ORDER BY COALESCE(dm.created_at, dc.created_at) DESC, u.display_name
`)
const directConversationDetailsQuery = db.prepare(`
  SELECT
    dc.id,
    u.id AS otherUserId,
    u.username AS otherUsername,
    u.display_name AS otherDisplayName
  FROM direct_conversations dc
  JOIN direct_conversation_participants dcp_self
    ON dcp_self.conversation_id = dc.id
  JOIN direct_conversation_participants dcp_other
    ON dcp_other.conversation_id = dc.id
   AND dcp_other.user_id != dcp_self.user_id
  JOIN users u
    ON u.id = dcp_other.user_id
  WHERE dc.id = ? AND dcp_self.user_id = ?
`)
const directMessagesQuery = db.prepare(`
  SELECT
    dm.id,
    dm.content,
    dm.created_at AS createdAt,
    u.id AS authorId,
    u.username,
    u.display_name AS displayName
  FROM direct_messages dm
  JOIN users u
    ON u.id = dm.author_id
  WHERE dm.conversation_id = ?
  ORDER BY dm.created_at
`)
const directConversationBetweenUsersQuery = db.prepare(`
  SELECT dcp1.conversation_id AS conversationId
  FROM direct_conversation_participants dcp1
  JOIN direct_conversation_participants dcp2
    ON dcp2.conversation_id = dcp1.conversation_id
  WHERE dcp1.user_id = ? AND dcp2.user_id = ?
  LIMIT 1
`)
const createDirectConversationQuery = db.prepare(`
  INSERT INTO direct_conversations (id, created_at)
  VALUES (?, ?)
`)
const createDirectParticipantQuery = db.prepare(`
  INSERT INTO direct_conversation_participants (conversation_id, user_id, joined_at)
  VALUES (?, ?, ?)
`)
const insertDirectMessageQuery = db.prepare(`
  INSERT INTO direct_messages (id, conversation_id, author_id, content, created_at)
  VALUES (?, ?, ?, ?, ?)
`)

const getViewerFromRequest = (request) => {
  const sessionId = request.headers['x-atlas-session']

  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return null
  }

  return sessionUserQuery.get(sessionId.trim()) ?? null
}

const requireViewer = (request, response) => {
  const viewer = getViewerFromRequest(request)

  if (!viewer) {
    sendJson(response, 401, { error: 'You need to sign in first.' })
    return null
  }

  return viewer
}

const requireOwner = (request, response) => {
  const viewer = requireViewer(request, response)

  if (!viewer) {
    return null
  }

  if (viewer.role !== 'owner' && !viewer.adminUnlocked) {
    sendJson(response, 403, { error: 'Only owner accounts can use this action.' })
    return null
  }

  return viewer
}

const getServers = () => {
  const tags = tagsByServerQuery.all()
  const channels = channelsByServerQuery.all()

  return bootstrapServersQuery.all().map((server) => ({
    ...server,
    isPublic: Boolean(server.isPublic),
    tags: tags.filter((tag) => tag.serverId === server.id).map((tag) => tag.tag),
    channels: channels
      .filter((channel) => channel.serverId === server.id)
      .map(({ serverId, position, ...channel }) => channel),
  }))
}

const getBootstrap = (viewer) => {
  const servers = getServers()

  return {
    product,
    viewer,
    quests: viewer ? questQuery.all(viewer.id).map((quest) => ({ ...quest, completed: Boolean(quest.completed) })) : [],
    servers,
    announcements: announcementsQuery.all(),
    adminLogs: adminLogsQuery.all(),
    discovery: {
      categories: [...new Set(servers.map((server) => server.category))],
      tags: [...new Set(servers.flatMap((server) => server.tags))],
    },
  }
}

const buildSessionResponse = (sessionId, user) => ({
  sessionId,
  user: {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    atlasCoins: user.atlasCoins,
    adminUnlocked: Boolean(user.adminUnlocked),
  },
})

const createGoogleAuthUrl = () => {
  if (!googleClientId || !googleClientSecret) {
    return null
  }

  const state = randomBytes(16).toString('hex')
  googleStateStore.set(state, Date.now())

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', googleClientId)
  url.searchParams.set('redirect_uri', googleRedirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('prompt', 'select_account')
  url.searchParams.set('state', state)

  return url.toString()
}

const exchangeGoogleCode = async (code) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: googleRedirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    throw new Error('Google token exchange failed.')
  }

  return response.json()
}

const fetchGoogleProfile = async (accessToken) => {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Google profile request failed.')
  }

  return response.json()
}

const sanitizeUsername = (value) => {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned.slice(0, 24) || `atlas_${randomBytes(4).toString('hex')}`
}

const ensureUniqueUsername = (baseUsername) => {
  let username = baseUsername
  let suffix = 1

  while (userByUsernameQuery.get(username)) {
    username = `${baseUsername.slice(0, 20)}_${suffix}`
    suffix += 1
  }

  return username
}

const createSessionForUser = (userId) => {
  const sessionId = id('session')
  insertSessionQuery.run(sessionId, userId, now())
  return sessionId
}

const setSecurityHeaders = (response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' http: https: ws: wss:; img-src 'self' data: blob: http: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:;",
  )
}

const allowedOrigins = new Set([
  'https://ukubot14-maker.github.io',
  'http://localhost:5173',
  appOrigin,
])

const allowCors = (request, response) => {
  const requestOrigin = String(request.headers.origin ?? '')

  if (allowedOrigins.has(requestOrigin)) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin)
  } else {
    response.setHeader('Access-Control-Allow-Origin', 'https://ukubot14-maker.github.io')
  }

  response.setHeader('Vary', 'Origin')
  response.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  )
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,X-Atlas-Session,Authorization'
  )
  response.setHeader('Access-Control-Allow-Credentials', 'true')
}

const applyRateLimit = (request, response, scope, options) => {
  const key = `${scope}:${getClientAddress(request)}`
  const nowMs = Date.now()
  const current = rateLimitStore.get(key)

  if (!current || current.resetAt <= nowMs) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: nowMs + options.windowMs,
    })
    return true
  }

  if (current.count >= options.maxRequests) {
    response.setHeader('Retry-After', String(Math.ceil((current.resetAt - nowMs) / 1000)))
    sendJson(response, 429, { error: 'Too many requests. Slow down and try again soon.' })
    return false
  }

  current.count += 1
  rateLimitStore.set(key, current)
  return true
}

const ensureAdminSecretInitialized = () => {
  const existingSecret = adminSecretQuery.get()

  if (existingSecret?.value) {
    return existingSecret
  }

  if (!config.adminUnlockPassword) {
    return null
  }

  const createdAt = now()
  upsertAdminSecretQuery.run(hashPassword(config.adminUnlockPassword), createdAt)
  return adminSecretQuery.get()
}

const createWebSocketFrame = (payload) => {
  const data = Buffer.from(JSON.stringify(payload))

  if (data.length >= 126) {
    throw new Error('WebSocket payload too large for the current frame encoder.')
  }

  return Buffer.concat([Buffer.from([0x81, data.length]), data])
}

const sendWebSocketEvent = (client, payload) => {
  try {
    client.socket.write(createWebSocketFrame(payload))
  } catch {
    client.socket.destroy()
    websocketClients.delete(client)
  }
}

const broadcastWebSocketEvent = (payload, predicate = () => true) => {
  for (const client of websocketClients) {
    if (!predicate(client)) {
      continue
    }

    sendWebSocketEvent(client, payload)
  }
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(response)
  allowCors(request, response)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const pathname = url.pathname

  try {
    if (request.method === 'GET' && pathname === '/health') {
      sendJson(response, 200, { ok: true, service: 'atlas-server' })
      return
    }

    if (request.method === 'GET' && pathname === '/api/auth/session') {
      sendJson(response, 200, { viewer: getViewerFromRequest(request) })
      return
    }

    if (request.method === 'GET' && pathname === '/api/auth/google/start') {
      const authUrl = createGoogleAuthUrl()

      if (!authUrl) {
        sendJson(response, 503, {
          error: 'Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        })
        return
      }

      response.writeHead(302, { Location: authUrl })
      response.end()
      return
    }

    if (request.method === 'GET' && pathname === '/api/auth/google/callback') {
      const code = String(url.searchParams.get('code') ?? '')
      const state = String(url.searchParams.get('state') ?? '')
      const authError = String(url.searchParams.get('error') ?? '')

      if (authError) {
        response.writeHead(302, { Location: `${appOrigin}/?auth_error=${encodeURIComponent(authError)}` })
        response.end()
        return
      }

      if (!code || !state || !googleStateStore.has(state)) {
        response.writeHead(302, { Location: `${appOrigin}/?auth_error=${encodeURIComponent('invalid_google_state')}` })
        response.end()
        return
      }

      googleStateStore.delete(state)

      try {
        const tokens = await exchangeGoogleCode(code)
        const profile = await fetchGoogleProfile(tokens.access_token)
        const googleSubject = String(profile.sub ?? '')
        const googleEmail = String(profile.email ?? '')

        if (!googleSubject || !googleEmail) {
          throw new Error('Google profile is missing required identity fields.')
        }

        const existingIdentity = authIdentityQuery.get('google', googleSubject)
        let userId = existingIdentity?.userId ?? null

        if (!userId) {
          const username = ensureUniqueUsername(sanitizeUsername(googleEmail.split('@')[0] ?? profile.name ?? 'atlas_user'))
          const displayName = String(profile.name ?? googleEmail ?? username).slice(0, 60)
          userId = id('user')
          const createdAt = now()

          db.exec('BEGIN')

          try {
            createGoogleUserQuery.run(userId, username, displayName, createdAt)
            addMembershipQuery.run('atlas-hq', userId, createdAt)
            createAuthIdentityQuery.run(id('identity'), userId, 'google', googleSubject, googleEmail, createdAt)
            db.exec('COMMIT')
          } catch (error) {
            db.exec('ROLLBACK')
            throw error
          }
        }

        const sessionId = createSessionForUser(userId)
        response.writeHead(302, {
          Location: `${appOrigin}/?session=${encodeURIComponent(sessionId)}`,
        })
        response.end()
      } catch (error) {
        response.writeHead(302, {
          Location: `${appOrigin}/?auth_error=${encodeURIComponent(
            error instanceof Error ? error.message : 'google_sign_in_failed',
          )}`,
        })
        response.end()
      }
      return
    }

    if (request.method === 'POST' && pathname === '/api/auth/register') {
      if (!applyRateLimit(request, response, 'auth-register', authRateLimit)) {
        return
      }

      const body = await parseBody(request)
      const username = String(body.username ?? '').trim()
      const displayName = String(body.displayName ?? '').trim()
      const password = String(body.password ?? '')

      if (!username || username.length < 3) {
        sendJson(response, 400, { error: 'Username must be at least 3 characters.' })
        return
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        sendJson(response, 400, { error: 'Username can use letters, numbers, and underscores only.' })
        return
      }

      if (!displayName || displayName.length < 2) {
        sendJson(response, 400, { error: 'Display name must be at least 2 characters.' })
        return
      }

      if (password.length < 8) {
        sendJson(response, 400, { error: 'Password must be at least 8 characters.' })
        return
      }

      if (userByUsernameQuery.get(username)) {
        sendJson(response, 409, { error: 'That username is already taken.' })
        return
      }

      const userId = id('user')
      const sessionId = id('session')
      const createdAt = now()
      const passwordHash = hashPassword(password)

      db.exec('BEGIN')

      try {
        createUserQuery.run(userId, username, displayName, createdAt, passwordHash)
        addMembershipQuery.run('atlas-hq', userId, createdAt)
        insertSessionQuery.run(sessionId, userId, createdAt)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      sendJson(response, 201, buildSessionResponse(sessionId, viewerQuery.get(userId)))
      return
    }

    if (request.method === 'POST' && pathname === '/api/auth/login') {
      if (!applyRateLimit(request, response, 'auth-login', authRateLimit)) {
        return
      }

      const body = await parseBody(request)
      const username = String(body.username ?? '').trim()
      const password = String(body.password ?? '')
      const user = userByUsernameQuery.get(username)

      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(response, 401, { error: 'Invalid username or password.' })
        return
      }

      const sessionId = id('session')
      insertSessionQuery.run(sessionId, user.id, now())
      sendJson(response, 200, buildSessionResponse(sessionId, user))
      return
    }

    if (request.method === 'GET' && pathname === '/api/bootstrap') {
      sendJson(response, 200, getBootstrap(getViewerFromRequest(request)))
      return
    }

    if (request.method === 'POST' && pathname === '/api/admin/unlock') {
      if (!applyRateLimit(request, response, 'admin-unlock', authRateLimit)) {
        return
      }

      const viewer = requireViewer(request, response)

      if (!viewer) {
        return
      }

      const sessionId = request.headers['x-atlas-session']
      const body = await parseBody(request)
      const password = String(body.password ?? '')

      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        sendJson(response, 400, { error: 'Session not found.' })
        return
      }

      const adminSecret = ensureAdminSecretInitialized()

      if (!adminSecret?.value) {
        sendJson(response, 503, { error: 'Admin unlock password is not configured.' })
        return
      }

      if (!verifyPassword(password, adminSecret.value)) {
        sendJson(response, 403, { error: 'Incorrect admin password.' })
        return
      }

      unlockSessionQuery.run(sessionId.trim())
      sendJson(response, 200, {
        viewer: sessionUserQuery.get(sessionId.trim()),
      })
      return
    }

    if (request.method === 'POST' && pathname === '/api/admin/rotate-unlock-secret') {
      if (!applyRateLimit(request, response, 'admin-rotate', authRateLimit)) {
        return
      }

      const viewer = requireViewer(request, response)

      if (!viewer) {
        return
      }

      if (viewer.role !== 'owner') {
        sendJson(response, 403, { error: 'Only the owner account can rotate the admin unlock secret.' })
        return
      }

      const body = await parseBody(request)
      const currentPassword = String(body.currentPassword ?? '')
      const nextPassword = String(body.nextPassword ?? '')

      if (nextPassword.length < 8) {
        sendJson(response, 400, { error: 'New admin password must be at least 8 characters.' })
        return
      }

      const adminSecret = ensureAdminSecretInitialized()

      if (!adminSecret?.value) {
        sendJson(response, 503, { error: 'Admin unlock password is not configured.' })
        return
      }

      if (!verifyPassword(currentPassword, adminSecret.value)) {
        sendJson(response, 403, { error: 'Current admin password is incorrect.' })
        return
      }

      const updatedAt = now()
      upsertAdminSecretQuery.run(hashPassword(nextPassword), updatedAt)
      resetUnlockedSessionsQuery.run()

      sendJson(response, 200, { ok: true, rotatedAt: updatedAt })
      return
    }

    if (request.method === 'GET' && pathname === '/api/discovery') {
      const query = (url.searchParams.get('query') ?? '').trim().toLowerCase()
      const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase()
      const results = getServers().filter((serverItem) => {
        const haystack = [serverItem.name, serverItem.description, serverItem.category, ...serverItem.tags]
          .join(' ')
          .toLowerCase()

        const matchesQuery = !query || haystack.includes(query)
        const matchesTag =
          !tag ||
          serverItem.category.toLowerCase() === tag ||
          serverItem.tags.some((serverTag) => serverTag.toLowerCase() === tag)

        return matchesQuery && matchesTag
      })

      sendJson(response, 200, { results })
      return
    }

    if (request.method === 'GET' && pathname === '/api/users') {
      const viewer = requireViewer(request, response)

      if (!viewer) {
        return
      }

      sendJson(response, 200, {
        users: usersDirectoryQuery.all(viewer.id),
      })
      return
    }

    if (request.method === 'GET' && pathname === '/api/direct-messages') {
      const viewer = requireViewer(request, response)

      if (!viewer) {
        return
      }

      sendJson(response, 200, {
        conversations: directConversationsQuery.all(viewer.id),
      })
      return
    }

    if (request.method === 'POST' && pathname === '/api/direct-messages') {
      if (!applyRateLimit(request, response, 'direct-conversation-create', writeRateLimit)) {
        return
      }

      const viewer = requireViewer(request, response)

      if (!viewer) {
        return
      }

      const body = await parseBody(request)
      const targetUserId = String(body.targetUserId ?? '').trim()

      if (!targetUserId || targetUserId === viewer.id) {
        sendJson(response, 400, { error: 'Select another user to start a direct message.' })
        return
      }

      const targetUser = viewerQuery.get(targetUserId)

      if (!targetUser) {
        sendJson(response, 404, { error: 'Target user not found.' })
        return
      }

      const existingConversation = directConversationBetweenUsersQuery.get(viewer.id, targetUserId)

      if (existingConversation?.conversationId) {
        sendJson(response, 200, {
          conversation: directConversationDetailsQuery.get(existingConversation.conversationId, viewer.id),
        })
        return
      }

      const conversationId = id('dm')
      const createdAt = now()

      db.exec('BEGIN')

      try {
        createDirectConversationQuery.run(conversationId, createdAt)
        createDirectParticipantQuery.run(conversationId, viewer.id, createdAt)
        createDirectParticipantQuery.run(conversationId, targetUserId, createdAt)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      sendJson(response, 201, {
        conversation: directConversationDetailsQuery.get(conversationId, viewer.id),
      })
      broadcastWebSocketEvent(
        {
          type: 'direct_conversation_created',
          conversationId,
          userIds: [viewer.id, targetUserId],
        },
        (client) => client.viewer?.id === viewer.id || client.viewer?.id === targetUserId,
      )
      return
    }

    const directMessagesRoute = pathname.match(/^\/api\/direct-messages\/([^/]+)\/messages$/)

    if (request.method === 'GET' && directMessagesRoute) {
      const viewer = requireViewer(request, response)

      if (!viewer) {
        return
      }

      const conversation = directConversationDetailsQuery.get(directMessagesRoute[1], viewer.id)

      if (!conversation) {
        sendJson(response, 404, { error: 'Direct conversation not found.' })
        return
      }

      sendJson(response, 200, {
        conversation,
        messages: directMessagesQuery.all(directMessagesRoute[1]).map((message) => ({
          id: message.id,
          content: message.content,
          createdAt: message.createdAt,
          author: {
            id: message.authorId,
            username: message.username,
            displayName: message.displayName,
          },
        })),
      })
      return
    }

    if (request.method === 'POST' && directMessagesRoute) {
      if (!applyRateLimit(request, response, 'direct-message-send', writeRateLimit)) {
        return
      }

      const viewer = requireViewer(request, response)

      if (!viewer) {
        return
      }

      const conversation = directConversationDetailsQuery.get(directMessagesRoute[1], viewer.id)

      if (!conversation) {
        sendJson(response, 404, { error: 'Direct conversation not found.' })
        return
      }

      const body = await parseBody(request)
      const content = String(body.content ?? '').trim()

      if (!content) {
        sendJson(response, 400, { error: 'Message content is required.' })
        return
      }

      const messageId = id('dm-msg')
      const createdAt = now()
      insertDirectMessageQuery.run(messageId, directMessagesRoute[1], viewer.id, content, createdAt)
      broadcastWebSocketEvent(
        {
          type: 'direct_message',
          conversationId: directMessagesRoute[1],
        },
        (client) => client.viewer?.id === viewer.id || client.viewer?.id === conversation.otherUserId,
      )

      sendJson(response, 201, {
        message: {
          id: messageId,
          content,
          createdAt,
          author: viewer,
        },
      })
      return
    }

    const messageRoute = pathname.match(/^\/api\/channels\/([^/]+)\/messages$/)

    if (request.method === 'GET' && messageRoute) {
      const channel = channelDetailsQuery.get(messageRoute[1])

      if (!channel) {
        sendJson(response, 404, { error: 'Channel not found.' })
        return
      }

      sendJson(response, 200, {
        channel,
        messages: messagesQuery.all(messageRoute[1]).map((message) => ({
          id: message.id,
          content: message.content,
          createdAt: message.createdAt,
          author: {
            id: message.authorId,
            username: message.username,
            displayName: message.displayName,
          },
        })),
      })
      return
    }

    if (request.method === 'POST' && messageRoute) {
      if (!applyRateLimit(request, response, 'channel-message-send', writeRateLimit)) {
        return
      }

      const viewer = requireViewer(request, response)

      if (!viewer) {
        return
      }

      const body = await parseBody(request)
      const content = String(body.content ?? '').trim()

      if (!content) {
        sendJson(response, 400, { error: 'Message content is required.' })
        return
      }

      const channel = channelDetailsQuery.get(messageRoute[1])

      if (!channel) {
        sendJson(response, 404, { error: 'Channel not found.' })
        return
      }

      const messageId = id('msg')
      const createdAt = now()
      insertMessageQuery.run(messageId, messageRoute[1], viewer.id, content, createdAt)
      broadcastWebSocketEvent({
        type: 'channel_message',
        channelId: messageRoute[1],
        serverId: channel.serverId,
      })

      sendJson(response, 201, {
        message: {
          id: messageId,
          content,
          createdAt,
          author: viewer,
        },
      })
      return
    }

    const questRoute = pathname.match(/^\/api\/quests\/([^/]+)\/complete$/)

    if (request.method === 'POST' && questRoute) {
      const viewer = requireViewer(request, response)

      if (!viewer) {
        return
      }

      const quest = questByIdQuery.get(questRoute[1])

      if (!quest) {
        sendJson(response, 404, { error: 'Quest not found.' })
        return
      }

      const completed = questCompletionQuery.get(viewer.id, quest.id)

      if (!completed) {
        insertQuestCompletionQuery.run(viewer.id, quest.id, now())
        incrementCoinsQuery.run(quest.reward, viewer.id)
      }

      sendJson(response, 200, {
        viewer: viewerQuery.get(viewer.id),
        quest: {
          ...quest,
          completed: true,
        },
      })
      return
    }

    if (request.method === 'POST' && pathname === '/api/admin/announce') {
      if (!applyRateLimit(request, response, 'admin-announce', adminRateLimit)) {
        return
      }

      const viewer = requireOwner(request, response)

      if (!viewer) {
        return
      }

      const body = await parseBody(request)
      const message = String(body.message ?? '').trim()

      if (!message) {
        sendJson(response, 400, { error: 'Announcement message is required.' })
        return
      }

      const createdAt = now()
      insertAnnouncementQuery.run(id('announcement'), viewer.id, message, createdAt)
      insertAdminLogQuery.run(id('log'), viewer.id, 'announce', 'all-servers', message, 'n/a', createdAt)
      broadcastWebSocketEvent({ type: 'announcement' })
      sendJson(response, 201, { ok: true, announcements: announcementsQuery.all(), adminLogs: adminLogsQuery.all() })
      return
    }

    if (request.method === 'POST' && pathname === '/api/admin/delete-channel') {
      if (!applyRateLimit(request, response, 'admin-delete-channel', adminRateLimit)) {
        return
      }

      const viewer = requireOwner(request, response)

      if (!viewer) {
        return
      }

      const body = await parseBody(request)
      const channelId = String(body.channelId ?? '').trim()
      const reason = String(body.reason ?? '').trim() || 'No reason provided'
      const channel = channelDetailsQuery.get(channelId)

      if (!channel) {
        sendJson(response, 404, { error: 'Channel not found.' })
        return
      }

      deleteChannelMessagesQuery.run(channelId)
      deleteChannelQuery.run(channelId)
      insertAdminLogQuery.run(id('log'), viewer.id, 'delete-channel', `#${channel.name}`, reason, 'n/a', now())
      broadcastWebSocketEvent({ type: 'admin_action', action: 'delete-channel' })
      sendJson(response, 200, { ok: true, bootstrap: getBootstrap(viewerQuery.get(viewer.id)) })
      return
    }

    if (request.method === 'POST' && pathname === '/api/admin/ban') {
      if (!applyRateLimit(request, response, 'admin-ban', adminRateLimit)) {
        return
      }

      const viewer = requireOwner(request, response)

      if (!viewer) {
        return
      }

      const body = await parseBody(request)
      const username = String(body.username ?? '').trim()
      const reason = String(body.reason ?? '').trim() || 'No reason provided'
      const durationDays = String(body.durationDays ?? '').trim() || 'forever'

      if (!username) {
        sendJson(response, 400, { error: 'Username is required.' })
        return
      }

      insertAdminLogQuery.run(id('log'), viewer.id, 'ban', username, reason, durationDays, now())
      broadcastWebSocketEvent({ type: 'admin_action', action: 'ban' })
      sendJson(response, 200, { ok: true, adminLogs: adminLogsQuery.all() })
      return
    }

    sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof Error && error.message === 'Request body too large.') {
      sendJson(response, 413, {
        error: 'Request body too large.',
        detail: `Maximum body size is ${config.maxBodySizeBytes} bytes.`,
      })
      return
    }

    sendJson(response, 500, {
      error: 'Unexpected server error.',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

server.listen(port, () => {
  console.log(`Atlas server listening on http://localhost:${port}`)
})

server.on('upgrade', (request, socket) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    const websocketKey = request.headers['sec-websocket-key']

    if (typeof websocketKey !== 'string') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy()
      return
    }

    const acceptKey = createHash('sha1')
      .update(websocketKey + websocketMagic)
      .digest('base64')

    const sessionId = String(url.searchParams.get('session') ?? '').trim()
    const viewer = sessionId ? sessionUserQuery.get(sessionId) ?? null : null

    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n',
      ].join('\r\n'),
    )

    const client = { socket, viewer }
    websocketClients.add(client)
    sendWebSocketEvent(client, { type: 'connected' })

    socket.on('close', () => {
      websocketClients.delete(client)
    })

    socket.on('end', () => {
      websocketClients.delete(client)
    })

    socket.on('error', () => {
      websocketClients.delete(client)
    })
  } catch {
    socket.destroy()
  }
})
