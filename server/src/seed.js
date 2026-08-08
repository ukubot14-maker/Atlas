import { db } from './db.js'
import { hashPassword } from './auth.js'
import { config } from './config.js'

const now = '2026-03-28T18:00:00.000Z'

const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count

const seedPasswords = config.seedPasswords
const adminSecretKey = 'admin_unlock_hash'

if (count('users') === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, display_name, role, atlas_coins, created_at, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const insertServer = db.prepare(`
    INSERT INTO servers (id, name, description, category, accent, is_public, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMembership = db.prepare(`
    INSERT INTO server_members (server_id, user_id, joined_at)
    VALUES (?, ?, ?)
  `)

  const insertChannel = db.prepare(`
    INSERT INTO channels (id, server_id, name, topic, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const insertMessage = db.prepare(`
    INSERT INTO messages (id, channel_id, author_id, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  const insertTag = db.prepare(`
    INSERT INTO server_tags (server_id, tag)
    VALUES (?, ?)
  `)

  const insertQuest = db.prepare(`
    INSERT INTO quests (id, title, description, reward)
    VALUES (?, ?, ?, ?)
  `)

  const insertQuestCompletion = db.prepare(`
    INSERT INTO user_quest_completions (user_id, quest_id, completed_at)
    VALUES (?, ?, ?)
  `)

  const insertAnnouncement = db.prepare(`
    INSERT INTO announcements (id, author_id, message, created_at)
    VALUES (?, ?, ?, ?)
  `)

  const insertLog = db.prepare(`
    INSERT INTO admin_logs (id, actor_id, action, target, reason, duration_days, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const insertDirectConversation = db.prepare(`
    INSERT INTO direct_conversations (id, created_at)
    VALUES (?, ?)
  `)

  const insertDirectParticipant = db.prepare(`
    INSERT INTO direct_conversation_participants (conversation_id, user_id, joined_at)
    VALUES (?, ?, ?)
  `)

  const insertDirectMessage = db.prepare(`
    INSERT INTO direct_messages (id, conversation_id, author_id, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  const users = [
    ['user-admin', 'AtlasAdmin', 'Atlas Admin', 'owner', 120, now, hashPassword(seedPasswords.AtlasAdmin)],
    ['user-nova', 'Nova', 'Nova Lane', 'member', 0, now, hashPassword(seedPasswords.Nova)],
    ['user-rowan', 'Rowan', 'Rowan Vale', 'member', 0, now, hashPassword(seedPasswords.Rowan)],
    ['user-kai', 'Kai', 'Kai Mercer', 'member', 0, now, hashPassword(seedPasswords.Kai)],
    ['user-mika', 'Mika', 'Mika Torres', 'member', 0, now, hashPassword(seedPasswords.Mika)],
  ]

  const servers = [
    [
      'atlas-hq',
      'Atlas HQ',
      'Build notes, launch planning, owner updates, and early community discussion.',
      'Product',
      '#63d6b3',
      1,
      now,
    ],
    [
      'night-study',
      'Night Study',
      'Study sessions, shared accountability, and quiet productivity channels.',
      'Education',
      '#ffd166',
      1,
      now,
    ],
    [
      'pixel-forge',
      'Pixel Forge',
      'Indie game dev, pixel art, feedback loops, and creator meetups.',
      'Creative',
      '#8ab4ff',
      1,
      now,
    ],
  ]

  const memberships = [
    ['atlas-hq', 'user-admin'],
    ['atlas-hq', 'user-nova'],
    ['atlas-hq', 'user-rowan'],
    ['atlas-hq', 'user-kai'],
    ['night-study', 'user-admin'],
    ['night-study', 'user-rowan'],
    ['night-study', 'user-mika'],
    ['pixel-forge', 'user-admin'],
    ['pixel-forge', 'user-kai'],
    ['pixel-forge', 'user-nova'],
  ]

  const channels = [
    ['channel-welcome', 'atlas-hq', 'welcome', 'Introduce yourself and meet early Atlas members.', 1, now],
    ['channel-launch', 'atlas-hq', 'launch-plans', 'Coordinate product milestones and release work.', 2, now],
    ['channel-ideas', 'atlas-hq', 'feature-ideas', 'Discuss missing features worth bringing back.', 3, now],
    ['channel-sprint', 'night-study', 'daily-sprint', 'Share goals and report back after a focused session.', 1, now],
    ['channel-resources', 'night-study', 'resources', 'Useful study templates, notes, and links.', 2, now],
    ['channel-showcase', 'pixel-forge', 'showcase', 'Share works in progress and get feedback.', 1, now],
  ]

  const messages = [
    ['msg-1', 'channel-welcome', 'user-admin', 'Welcome to Atlas HQ. This is a real local prototype, not just a mock page.', '2026-03-28T16:05:00.000Z'],
    ['msg-2', 'channel-welcome', 'user-nova', 'The next big step is replacing fake metrics with real stored data everywhere.', '2026-03-28T16:08:00.000Z'],
    ['msg-3', 'channel-launch', 'user-rowan', 'We should keep the interface familiar but earn trust with honest numbers and real state.', '2026-03-28T16:40:00.000Z'],
    ['msg-4', 'channel-launch', 'user-admin', 'Agreed. Every member count and message count should come from the database.', '2026-03-28T16:42:00.000Z'],
    ['msg-5', 'channel-ideas', 'user-kai', 'A visual bot builder still belongs on the roadmap, but it should sit on top of a solid platform core.', '2026-03-28T16:55:00.000Z'],
    ['msg-6', 'channel-sprint', 'user-rowan', 'Tonight: finish algebra review and post notes in resources.', '2026-03-28T17:15:00.000Z'],
    ['msg-7', 'channel-resources', 'user-mika', 'Uploaded a new spaced repetition template for exam prep.', '2026-03-28T17:25:00.000Z'],
    ['msg-8', 'channel-showcase', 'user-kai', 'Sharing a new lighting pass for my pixel forest scene.', '2026-03-28T17:40:00.000Z'],
  ]

  const tags = [
    ['atlas-hq', 'Announcements'],
    ['atlas-hq', 'Platform'],
    ['atlas-hq', 'Feedback'],
    ['night-study', 'Productivity'],
    ['night-study', 'Study'],
    ['night-study', 'Events'],
    ['pixel-forge', 'Game Dev'],
    ['pixel-forge', 'Art'],
    ['pixel-forge', 'Collaboration'],
  ]

  const quests = [
    ['quest-smile', 'Send :) to a friend', 'A tiny social quest that rewards friendly behavior.', 15],
    ['quest-intro', 'Post an intro in #welcome', 'Help a new community feel alive from the start.', 20],
    ['quest-poll', 'Vote in a community poll', 'Encourage participation without needing extra bots.', 10],
  ]

  const directConversations = [
    ['dm-admin-nova', now],
    ['dm-admin-rowan', now],
  ]

  const directParticipants = [
    ['dm-admin-nova', 'user-admin', now],
    ['dm-admin-nova', 'user-nova', now],
    ['dm-admin-rowan', 'user-admin', now],
    ['dm-admin-rowan', 'user-rowan', now],
  ]

  const directMessages = [
    ['dm-msg-1', 'dm-admin-nova', 'user-nova', 'Can we turn DMs into a first-class feature tonight?', '2026-03-28T18:20:00.000Z'],
    ['dm-msg-2', 'dm-admin-nova', 'user-admin', 'Yes. Real one-to-one messaging is the next shipping target.', '2026-03-28T18:22:00.000Z'],
    ['dm-msg-3', 'dm-admin-rowan', 'user-rowan', 'I want direct notes and feedback without cluttering the main server.', '2026-03-28T18:25:00.000Z'],
  ]

  db.exec('BEGIN')

  try {
    users.forEach((entry) => insertUser.run(...entry))
    servers.forEach((entry) => insertServer.run(...entry))
    memberships.forEach(([serverId, userId]) => insertMembership.run(serverId, userId, now))
    channels.forEach((entry) => insertChannel.run(...entry))
    messages.forEach((entry) => insertMessage.run(...entry))
    tags.forEach((entry) => insertTag.run(...entry))
    quests.forEach((entry) => insertQuest.run(...entry))
    directConversations.forEach((entry) => insertDirectConversation.run(...entry))
    directParticipants.forEach((entry) => insertDirectParticipant.run(...entry))
    directMessages.forEach((entry) => insertDirectMessage.run(...entry))
    insertQuestCompletion.run('user-admin', 'quest-intro', now)
    insertAnnouncement.run('announcement-1', 'user-admin', 'Atlas local platform prototype is online.', now)
    insertLog.run('log-1', 'user-admin', 'announce', 'all-servers', 'Initial launch update', 'n/a', now)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

const usersWithoutPassword = db
  .prepare(`SELECT id, username FROM users WHERE password_hash = '' OR password_hash IS NULL`)
  .all()

const updatePassword = db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
const adminSecretQuery = db.prepare(`SELECT value FROM app_secrets WHERE key = ?`)
const insertAdminSecretQuery = db.prepare(`
  INSERT INTO app_secrets (key, value, updated_at)
  VALUES (?, ?, ?)
`)

for (const user of usersWithoutPassword) {
  const password =
    seedPasswords[user.username] ??
    process.env.ATLAS_DEFAULT_SEED_PASSWORD ??
    `${user.username.toLowerCase()}12345`
  updatePassword.run(hashPassword(password), user.id)
}

if (!adminSecretQuery.get(adminSecretKey)?.value && config.adminUnlockPassword) {
  insertAdminSecretQuery.run(adminSecretKey, hashPassword(config.adminUnlockPassword), now)
}

const existingDmCount = count('direct_conversations')

if (existingDmCount === 0) {
  const insertDirectConversation = db.prepare(`
    INSERT INTO direct_conversations (id, created_at)
    VALUES (?, ?)
  `)
  const insertDirectParticipant = db.prepare(`
    INSERT INTO direct_conversation_participants (conversation_id, user_id, joined_at)
    VALUES (?, ?, ?)
  `)
  const insertDirectMessage = db.prepare(`
    INSERT INTO direct_messages (id, conversation_id, author_id, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  db.exec('BEGIN')

  try {
    insertDirectConversation.run('dm-admin-nova', now)
    insertDirectConversation.run('dm-admin-rowan', now)
    insertDirectParticipant.run('dm-admin-nova', 'user-admin', now)
    insertDirectParticipant.run('dm-admin-nova', 'user-nova', now)
    insertDirectParticipant.run('dm-admin-rowan', 'user-admin', now)
    insertDirectParticipant.run('dm-admin-rowan', 'user-rowan', now)
    insertDirectMessage.run('dm-msg-1', 'dm-admin-nova', 'user-nova', 'Can we turn DMs into a first-class feature tonight?', '2026-03-28T18:20:00.000Z')
    insertDirectMessage.run('dm-msg-2', 'dm-admin-nova', 'user-admin', 'Yes. Real one-to-one messaging is the next shipping target.', '2026-03-28T18:22:00.000Z')
    insertDirectMessage.run('dm-msg-3', 'dm-admin-rowan', 'user-rowan', 'I want direct notes and feedback without cluttering the main server.', '2026-03-28T18:25:00.000Z')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
