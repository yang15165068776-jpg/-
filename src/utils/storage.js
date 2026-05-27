function getPrefix(mode) {
  if (mode === 'story') return 'story_'
  if (mode === 'daily') return 'daily_'
  return 'rp_'
}

function getKeys(mode) {
  const p = getPrefix(mode)
  return {
    CHARACTERS: p + 'characters',
    CHAT_ARCHIVES: p + 'chat_archives',
    SETTINGS: 'rp_settings',
    MIGRATION: '_' + p + 'migrated_v2',
  }
}

function migrateChatArchives(mode) {
  const keys = getKeys(mode)
  if (localStorage.getItem(keys.MIGRATION)) return
  const oldRaw = localStorage.getItem('rp_chat_history')
  const newRaw = localStorage.getItem(keys.CHAT_ARCHIVES)
  if (newRaw) {
    localStorage.setItem(keys.MIGRATION, '1')
    return
  }
  if (!oldRaw) {
    localStorage.setItem(keys.MIGRATION, '1')
    return
  }
  try {
    const oldData = JSON.parse(oldRaw)
    const newData = JSON.parse(localStorage.getItem(keys.CHAT_ARCHIVES) || '{}')
    for (const [characterId, entry] of Object.entries(oldData)) {
      if (!entry.messages || entry.messages.length === 0) continue
      const archiveId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
      newData[archiveId] = {
        id: archiveId,
        characterId,
        name: '默认对话',
        createdAt: Date.now(),
        messages: entry.messages,
        affection: entry.affection ?? null,
      }
    }
    localStorage.setItem(keys.CHAT_ARCHIVES, JSON.stringify(newData))
  } catch {}
  localStorage.setItem(keys.MIGRATION, '1')
}

// ---------- Characters ----------

export function getCharacters(mode) {
  try {
    return JSON.parse(localStorage.getItem(getKeys(mode).CHARACTERS) || '[]')
  } catch { return [] }
}

export function saveCharacters(characters, mode) {
  localStorage.setItem(getKeys(mode).CHARACTERS, JSON.stringify(characters))
}

export function getCharacter(id, mode) {
  return getCharacters(mode).find(c => c.id === id) || null
}

export function saveCharacter(character, mode) {
  const list = getCharacters(mode)
  const idx = list.findIndex(c => c.id === character.id)
  if (idx >= 0) {
    list[idx] = character
  } else {
    list.push(character)
  }
  saveCharacters(list, mode)
  return character
}

export function deleteCharacter(id, mode) {
  const list = getCharacters(mode).filter(c => c.id !== id)
  saveCharacters(list, mode)
  const keys = getKeys(mode)
  const all = JSON.parse(localStorage.getItem(keys.CHAT_ARCHIVES) || '{}')
  for (const [archiveId, archive] of Object.entries(all)) {
    if (archive.characterId === id) {
      delete all[archiveId]
    }
  }
  localStorage.setItem(keys.CHAT_ARCHIVES, JSON.stringify(all))
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

// ---------- Archives ----------

function readArchives(mode) {
  migrateChatArchives(mode)
  try {
    return JSON.parse(localStorage.getItem(getKeys(mode).CHAT_ARCHIVES) || '{}')
  } catch { return {} }
}

function writeArchives(data, mode) {
  localStorage.setItem(getKeys(mode).CHAT_ARCHIVES, JSON.stringify(data))
}

export function getArchives(characterId, mode) {
  const all = readArchives(mode)
  return Object.values(all)
    .filter(a => a.characterId === characterId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function getArchive(archiveId, mode) {
  const all = readArchives(mode)
  return all[archiveId] || null
}

export function getOrCreateDefaultArchive(characterId, mode) {
  const existing = getArchives(characterId, mode)
  if (existing.length > 0) return existing[0]
  const archiveId = generateId()
  const archive = {
    id: archiveId,
    characterId,
    name: '默认对话',
    createdAt: Date.now(),
    messages: [],
    affection: null,
    affections: null,
  }
  saveArchive(archive, mode)
  return archive
}

export function createArchive(characterId, name, mode) {
  const archiveId = generateId()
  const archive = {
    id: archiveId,
    characterId,
    name: name || '新对话',
    createdAt: Date.now(),
    messages: [],
    affection: null,
    affections: null,
  }
  saveArchive(archive, mode)
  return archive
}

export function saveArchive(archive, mode) {
  const all = readArchives(mode)
  all[archive.id] = archive
  writeArchives(all, mode)
}

export function deleteArchive(archiveId, mode) {
  const all = readArchives(mode)
  delete all[archiveId]
  writeArchives(all, mode)
}

export function renameArchive(archiveId, newName, mode) {
  const archive = getArchive(archiveId, mode)
  if (!archive) return
  archive.name = newName
  saveArchive(archive, mode)
}

// ---------- Chat messages ----------

export function getChatMessages(archiveId, mode) {
  const archive = getArchive(archiveId, mode)
  return archive?.messages || []
}

export function getAffection(archiveId, mode) {
  const archive = getArchive(archiveId, mode)
  return archive?.affection ?? null
}

export function getAffections(archiveId, mode) {
  const archive = getArchive(archiveId, mode)
  return archive?.affections ?? null
}

export function saveChatMessages(archiveId, messages, mode) {
  const archive = getArchive(archiveId, mode)
  if (!archive) return
  archive.messages = messages
  saveArchive(archive, mode)
}

export function saveAffection(archiveId, value, mode) {
  const archive = getArchive(archiveId, mode)
  if (!archive) return
  archive.affection = value
  saveArchive(archive, mode)
}

export function saveAffections(archiveId, affections, mode) {
  const archive = getArchive(archiveId, mode)
  if (!archive) return
  archive.affections = affections
  saveArchive(archive, mode)
}

export function clearChatHistory(archiveId, mode) {
  deleteArchive(archiveId, mode)
}

// ---------- Settings (shared across modes) ----------

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem('rp_settings') || '{}')
  } catch { return {} }
}

export function saveSettings(settings) {
  localStorage.setItem('rp_settings', JSON.stringify(settings))
}

export function getApiKey() {
  return getSettings().apiKey || ''
}

export function saveApiKey(key) {
  const settings = getSettings()
  settings.apiKey = key
  saveSettings(settings)
}

export function getModel() {
  return getSettings().model || 'deepseek-chat'
}

export function saveModel(model) {
  const settings = getSettings()
  settings.model = model
  saveSettings(settings)
}

export function getUserAvatar() {
  return getSettings().userAvatar || ''
}

export function saveUserAvatar(avatar) {
  const settings = getSettings()
  settings.userAvatar = avatar
  saveSettings(settings)
}
