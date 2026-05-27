const STORAGE_KEYS = {
  CHARACTERS: 'rp_characters',
  CHAT_HISTORY: 'rp_chat_history',
  SETTINGS: 'rp_settings',
}

export function getCharacters() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CHARACTERS) || '[]')
  } catch { return [] }
}

export function saveCharacters(characters) {
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(characters))
}

export function getCharacter(id) {
  return getCharacters().find(c => c.id === id) || null
}

export function saveCharacter(character) {
  const list = getCharacters()
  const idx = list.findIndex(c => c.id === character.id)
  if (idx >= 0) {
    list[idx] = character
  } else {
    list.push(character)
  }
  saveCharacters(list)
  return character
}

export function deleteCharacter(id) {
  const list = getCharacters().filter(c => c.id !== id)
  saveCharacters(list)
  // Also delete associated chat history
  const history = getChatHistory()
  delete history[id]
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history))
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

// Chat history
export function getChatHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '{}')
  } catch { return {} }
}

export function getChatMessages(characterId) {
  const history = getChatHistory()
  return history[characterId]?.messages || []
}

export function getAffection(characterId) {
  const history = getChatHistory()
  return history[characterId]?.affection ?? null
}

export function saveChatMessages(characterId, messages) {
  const history = getChatHistory()
  if (!history[characterId]) {
    history[characterId] = { messages: [], affection: null }
  }
  history[characterId].messages = messages
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history))
}

export function saveAffection(characterId, value) {
  const history = getChatHistory()
  if (!history[characterId]) {
    history[characterId] = { messages: [], affection: value }
  } else {
    history[characterId].affection = value
  }
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history))
}

export function clearChatHistory(characterId) {
  const history = getChatHistory()
  delete history[characterId]
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history))
}

// Settings
export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}')
  } catch { return {} }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings))
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
