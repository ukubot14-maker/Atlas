import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'

const sqlitePath = resolve(process.cwd(), 'data', 'atlas.db')
const schemaPath = resolve(process.cwd(), 'postgres', 'schema.sql')
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to migrate Atlas data to PostgreSQL.')
}

const sqlite = new DatabaseSync(sqlitePath, { readonly: true })
const client = new pg.Client({ connectionString: databaseUrl })

const tables = [
  'users',
  'servers',
  'server_members',
  'channels',
  'messages',
  'server_tags',
  'announcements',
  'admin_logs',
  'quests',
  'user_quest_completions',
  'sessions',
  'auth_identities',
  'direct_conversations',
  'direct_conversation_participants',
  'direct_messages',
  'app_secrets',
]

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`

const copyTable = async (tableName) => {
  const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all()

  if (rows.length === 0) {
    return
  }

  const columns = Object.keys(rows[0])
  const quotedColumns = columns.map(quoteIdentifier).join(', ')
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
  const query = `INSERT INTO ${quoteIdentifier(tableName)} (${quotedColumns}) VALUES (${placeholders})`

  for (const row of rows) {
    await client.query(query, columns.map((column) => row[column]))
  }
}

await client.connect()

try {
  await client.query('BEGIN')
  await client.query(readFileSync(schemaPath, 'utf8'))

  for (const tableName of [...tables].reverse()) {
    await client.query(`DELETE FROM ${quoteIdentifier(tableName)}`)
  }

  for (const tableName of tables) {
    await copyTable(tableName)
  }

  await client.query('COMMIT')
  console.log('Atlas SQLite data migrated to PostgreSQL successfully.')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
  sqlite.close()
}
