/**
 * Folder Store — Top-level container for Character OS v6
 *
 * Architecture:
 *   Folder = World instance (世界容器)
 *     ├── Characters (角色，来自 legacy 或新建)
 *     ├── USK (单一状态源，内含多角色子状态 + global_state)
 *     └── Saves (时间点存档，仅存消息，不存状态)
 *
 * Principles:
 *   1. Folder 是世界容器，不是角色容器
 *   2. USK 是唯一状态源 (SSOT)
 *   3. Save 只存消息，状态永远来自 USK
 *   4. 所有 legacy 数据通过 adapter 接入
 *
 * Storage keys:
 *   jsjg_folders           — Folder[] array
 *   jsjg_folder_saves_<id> — { [saveId]: Save }
 *   jsjg_player_profile    — PlayerProfile
 */

// ═══════════════════════════════════════════════════════════
// Storage keys
// ═══════════════════════════════════════════════════════════

const FOLDERS_KEY = 'jsjg_folders'
const SAVES_PREFIX = 'jsjg_folder_saves_'
const PROFILE_KEY = 'jsjg_player_profile'

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // Attempt cleanup: trim oldest saves
      try {
        const folders = _readFolders()
        for (const f of folders) {
          const saves = _readSaves(f.id)
          const ids = Object.keys(saves)
          if (ids.length > 10) {
            const oldest = ids.sort((a, b) => (saves[a].createdAt || 0) - (saves[b].createdAt || 0)).slice(0, ids.length - 5)
            for (const id of oldest) delete saves[id]
            localStorage.setItem(SAVES_PREFIX + f.id, JSON.stringify(saves))
          }
        }
        localStorage.setItem(key, value)
        return true
      } catch {
        alert('存储空间不足，请清理部分存档')
        return false
      }
    }
    return false
  }
}

// ═══════════════════════════════════════════════════════════
// Internal readers
// ═══════════════════════════════════════════════════════════

function _readFolders() {
  try {
    return JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]')
  } catch { return [] }
}

function _writeFolders(folders) {
  safeSet(FOLDERS_KEY, JSON.stringify(folders))
}

function _readSaves(folderId) {
  try {
    return JSON.parse(localStorage.getItem(SAVES_PREFIX + folderId) || '{}')
  } catch { return {} }
}

function _writeSaves(folderId, saves) {
  safeSet(SAVES_PREFIX + folderId, JSON.stringify(saves))
}

// ═══════════════════════════════════════════════════════════
// Folder CRUD
// ═══════════════════════════════════════════════════════════

/**
 * Create a new Folder (世界).
 *
 * @param {string} name — 世界/计划名称
 * @param {string} worldview — 世界观描述
 * @param {string} storyIntro — 开场剧情
 * @returns {object} Folder
 */
export function createFolder(name, worldview = '', storyIntro = '') {
  const folders = _readFolders()
  const folder = {
    id: generateId(),
    name: name || '未命名世界',
    worldview,
    story_intro: storyIntro,
    characterIds: [],       // legacy character ids imported into this folder
    characterData: [],      // inline character data for folder-native characters
    saveIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  folders.push(folder)
  _writeFolders(folders)
  // Initialize empty saves store
  _writeSaves(folder.id, {})
  return folder
}

/**
 * Get all Folders, sorted by updatedAt desc.
 * @returns {object[]}
 */
export function getAllFolders() {
  const folders = _readFolders()
  return folders.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
}

/**
 * Get a single Folder by ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getFolder(id) {
  if (!id) return null
  return _readFolders().find(f => f.id === id) || null
}

/**
 * Update a Folder's metadata.
 * @param {string} id
 * @param {object} updates — { name?, worldview?, story_intro? }
 * @returns {object|null} updated Folder
 */
export function updateFolder(id, updates) {
  const folders = _readFolders()
  const idx = folders.findIndex(f => f.id === id)
  if (idx === -1) return null
  const allowed = ['name', 'worldview', 'story_intro', 'characterIds', 'characterData', 'saveIds']
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      folders[idx][key] = updates[key]
    }
  }
  folders[idx].updatedAt = Date.now()
  _writeFolders(folders)
  return folders[idx]
}

/**
 * Delete a Folder and all its saves.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteFolder(id) {
  const folders = _readFolders().filter(f => f.id !== id)
  _writeFolders(folders)
  // Remove saves
  try { localStorage.removeItem(SAVES_PREFIX + id) } catch {}
  // Remove USK
  try { localStorage.removeItem('jsjg_folder_usk_' + id) } catch {}
  return true
}

// ═══════════════════════════════════════════════════════════
// Characters in Folder
// ═══════════════════════════════════════════════════════════

/**
 * Add a legacy character reference to a Folder.
 * The actual character data stays in story_characters / daily_characters.
 *
 * @param {string} folderId
 * @param {string} characterId — legacy character ID
 * @param {string} mode — 'story' | 'daily' (where the actual data lives)
 * @returns {object|null} updated Folder
 */
export function addCharacterToFolder(folderId, characterId, mode = 'story') {
  const folder = getFolder(folderId)
  if (!folder) return null
  if (folder.characterIds.includes(characterId)) return folder

  const updated = {
    characterIds: [...folder.characterIds, characterId],
  }
  return updateFolder(folderId, updated)
}

/**
 * Remove a character reference from a Folder.
 * @returns {object|null} updated Folder
 */
export function removeCharacterFromFolder(folderId, characterId) {
  const folder = getFolder(folderId)
  if (!folder) return null
  return updateFolder(folderId, {
    characterIds: folder.characterIds.filter(id => id !== characterId),
  })
}

/**
 * Add inline character data to a Folder (folder-native, not legacy).
 * Used when characters are created directly inside a Folder context.
 *
 * @param {string} folderId
 * @param {object} charData — { name, personality, background, ... }
 * @returns {object|null} updated Folder
 */
export function addInlineCharacter(folderId, charData) {
  const folder = getFolder(folderId)
  if (!folder) return null

  const newChar = {
    id: generateId(),
    ...charData,
    createdAt: Date.now(),
  }

  return updateFolder(folderId, {
    characterData: [...(folder.characterData || []), newChar],
  })
}

/**
 * Get all characters in a Folder (both legacy refs and inline).
 * Returns a unified array for UI consumption.
 *
 * @param {string} folderId
 * @returns {object[]} — [ { id, name, avatar, source: 'legacy'|'inline', mode?, raw }, ... ]
 */
export function getFolderCharacters(folderId) {
  const folder = getFolder(folderId)
  if (!folder) return []

  const chars = []

  // Inline characters
  for (const c of (folder.characterData || [])) {
    chars.push({
      id: c.id,
      name: c.name || '',
      avatar: c.avatar || '',
      personality: c.personality || '',
      source: 'inline',
      raw: c,
    })
  }

  // Legacy character references — try to resolve from storage
  for (const charId of (folder.characterIds || [])) {
    // Try story mode first, then daily
    let raw = null
    let mode = null
    try {
      const storyChars = JSON.parse(localStorage.getItem('story_characters') || '[]')
      raw = storyChars.find(c => c.id === charId)
      if (raw) mode = 'story'
    } catch {}
    if (!raw) {
      try {
        const dailyChars = JSON.parse(localStorage.getItem('daily_characters') || '[]')
        raw = dailyChars.find(c => c.id === charId)
        if (raw) mode = 'daily'
      } catch {}
    }
    if (raw) {
      chars.push({
        id: raw.id,
        name: raw.name || '',
        avatar: raw.avatar || '',
        source: 'legacy',
        mode,
        raw,
      })
    }
  }

  return chars
}

// ═══════════════════════════════════════════════════════════
// Save CRUD (时间点存档)
// ═══════════════════════════════════════════════════════════

/**
 * Create a new Save within a Folder.
 * Save = time point in the story. Stores messages only; state comes from USK.
 *
 * @param {string} folderId
 * @param {string} name — save name
 * @returns {object} Save
 */
export function createSave(folderId, name) {
  const folder = getFolder(folderId)
  if (!folder) return null

  const save = {
    id: generateId(),
    folderId,
    name: name || '新存档',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    // Note: NO affection/affections — state is from USK (SSOT)
  }

  const saves = _readSaves(folderId)
  saves[save.id] = save
  _writeSaves(folderId, saves)

  // Update folder's saveIds
  updateFolder(folderId, { saveIds: [...folder.saveIds, save.id] })

  return save
}

/**
 * Get all Saves for a Folder, sorted by updatedAt desc.
 * @param {string} folderId
 * @returns {object[]}
 */
export function getSaves(folderId) {
  const saves = _readSaves(folderId)
  return Object.values(saves).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
}

/**
 * Get a single Save.
 * @param {string} saveId
 * @param {string} folderId
 * @returns {object|null}
 */
export function getSave(saveId, folderId) {
  if (!saveId || !folderId) return null
  const saves = _readSaves(folderId)
  return saves[saveId] || null
}

/**
 * Get or create the default save for a Folder.
 * @returns {object} Save
 */
export function getOrCreateDefaultSave(folderId) {
  const existing = getSaves(folderId)
  if (existing.length > 0) return existing[0]
  return createSave(folderId, '默认存档')
}

/**
 * Save messages to a Save slot.
 * @param {string} saveId
 * @param {string} folderId
 * @param {object[]} messages
 */
export function updateSaveMessages(saveId, folderId, messages) {
  const saves = _readSaves(folderId)
  if (!saves[saveId]) return
  saves[saveId].messages = messages
  saves[saveId].updatedAt = Date.now()
  _writeSaves(folderId, saves)
}

/**
 * Delete a Save.
 */
export function deleteSave(saveId, folderId) {
  const saves = _readSaves(folderId)
  delete saves[saveId]
  _writeSaves(folderId, saves)

  const folder = getFolder(folderId)
  if (folder) {
    updateFolder(folderId, { saveIds: folder.saveIds.filter(id => id !== saveId) })
  }
}

/**
 * Rename a Save.
 */
export function renameSave(saveId, folderId, newName) {
  const saves = _readSaves(folderId)
  if (!saves[saveId]) return
  saves[saveId].name = newName
  saves[saveId].updatedAt = Date.now()
  _writeSaves(folderId, saves)
}

// ═══════════════════════════════════════════════════════════
// Player Profile
// ═══════════════════════════════════════════════════════════

/**
 * Get the player profile.
 * @returns {{ name: string, avatar: string, gender: string, personalityTags: string[] }}
 */
export function getPlayerProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return { name: '', avatar: '', gender: '', personalityTags: [] }
    return JSON.parse(raw)
  } catch {
    return { name: '', avatar: '', gender: '', personalityTags: [] }
  }
}

/**
 * Save the player profile.
 * @param {object} profile — { name?, avatar?, gender?, personalityTags? }
 */
export function savePlayerProfile(profile) {
  const existing = getPlayerProfile()
  const merged = { ...existing, ...profile }
  safeSet(PROFILE_KEY, JSON.stringify(merged))
  return merged
}

// ═══════════════════════════════════════════════════════════
// Legacy Adapter — import legacy character into Folder
// ═══════════════════════════════════════════════════════════

/**
 * Import a legacy character into a Folder.
 * The character data is copied inline (not referenced) to avoid
 * breaking if the original is deleted.
 *
 * @param {string} folderId
 * @param {object} character — raw character from getCharacter(id, mode)
 * @param {string} mode — 'story' | 'daily'
 * @returns {object|null} updated Folder
 */
export function importLegacyCharacterToFolder(folderId, character, mode) {
  if (!character || !folderId) return null

  const charData = {
    name: character.name || '',
    avatar: character.avatar || '',
    personality: character.personality || '',
    background: character.background || '',
    speakingStyle: character.speakingStyle || '',
    worldSetting: character.worldSetting || '',
    openingScenario: character.openingScenario || '',
    storyTone: character.storyTone || '',
    protagonistName: character.protagonistName || '',
    protagonistGender: character.protagonistGender || '',
    protagonistBackground: character.protagonistBackground || '',
    protagonistPersonality: character.protagonistPersonality || '',
    romanceCharacters: character.romanceCharacters || [],
    npcs: character.npcs || [],
    styleRules: character.styleRules || [],
    forbiddenWords: character.forbiddenWords || [],
    affectionEnabled: character.affectionEnabled || false,
    affectionInitial: character.affectionInitial ?? 50,
    affectionStages: character.affectionStages || [],
    contextWindow: character.contextWindow || 40,
    thinkingEnabled: character.thinkingEnabled || false,
    thinkingPrompt: character.thinkingPrompt || '',
    activeMessageEnabled: character.activeMessageEnabled || false,
    activePrompt: character.activePrompt || '',
    nickname: character.nickname || '',
    temperature: character.temperature ?? 0.9,
    topP: character.topP ?? 0.95,
    legacyId: character.id,        // track origin
    legacyMode: mode,              // track origin mode
    importedAt: Date.now(),
  }

  return addInlineCharacter(folderId, charData)
}

/**
 * Check if a Folder has any characters.
 */
export function folderHasCharacters(folderId) {
  const chars = getFolderCharacters(folderId)
  return chars.length > 0
}

/**
 * Get the total count of saves across all folders.
 * Useful for storage management.
 */
export function getTotalSaveCount() {
  const folders = _readFolders()
  let count = 0
  for (const f of folders) {
    const saves = _readSaves(f.id)
    count += Object.keys(saves).length
  }
  return count
}
