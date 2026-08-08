import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const configPath = resolve(process.cwd(), 'config.local.json')

const localConfig = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, 'utf8'))
  : {}

const getSecret = (envKey, localValue, fallback = '') =>
  process.env[envKey] ?? localValue ?? fallback

export const config = {
  appOrigin: process.env.APP_ORIGIN ?? localConfig.appOrigin ?? 'http://localhost:5173',
  isProduction: (process.env.NODE_ENV ?? 'development') === 'production',
  maxBodySizeBytes: Number(process.env.ATLAS_MAX_BODY_SIZE_BYTES ?? localConfig.maxBodySizeBytes ?? 100_000),
  adminUnlockPassword: getSecret(
    'ATLAS_ADMIN_UNLOCK_PASSWORD',
    localConfig.adminUnlockPassword,
    '',
  ),
  seedPasswords: {
    AtlasAdmin: getSecret(
      'ATLAS_SEED_PASSWORD_ATLASADMIN',
      localConfig.seedPasswords?.AtlasAdmin,
      '',
    ),
    Nova: getSecret('ATLAS_SEED_PASSWORD_NOVA', localConfig.seedPasswords?.Nova, ''),
    Rowan: getSecret('ATLAS_SEED_PASSWORD_ROWAN', localConfig.seedPasswords?.Rowan, ''),
    Kai: getSecret('ATLAS_SEED_PASSWORD_KAI', localConfig.seedPasswords?.Kai, ''),
    Mika: getSecret('ATLAS_SEED_PASSWORD_MIKA', localConfig.seedPasswords?.Mika, ''),
  },
}
