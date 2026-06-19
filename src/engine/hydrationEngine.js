/**
 * HydrationEngine v1 — State recovery layer.
 *
 * Caches page state (messages, USK) so navigating away and back
 * doesn't lose everything. Also loads state from folder saves.
 *
 * This fixes: archives not loading, blank pages after back, state fracture.
 *
 * Usage:
 *   // Before navigating away from DramaPage:
 *   HydrationEngine.save(folderId, 'drama', messages, uskSnapshot)
 *
 *   // When DramaPage mounts:
 *   const cached = HydrationEngine.get(folderId, 'drama')
 *   if (cached) { setMessages(cached.messages); setUSK(cached.usk) }
 *
 *   // When opening a save from FolderInterior:
 *   const state = HydrationEngine.hydrate(folderId, saveId)
 */

import { getSave, getSaveMessages } from '../state/folderStore'
import { loadFolderUSK } from '../state/unifiedStateKernel'

const HydrationEngine = {
  /** { [`${folderId}:${mode}`]: { messages, usk, timestamp } } */
  cache: {},

  /**
   * Cache current page state before navigating away.
   * Call this in the page's cleanup or before NavigationEngine.push/back.
   *
   * @param {string} folderId
   * @param {string} mode — 'drama' | 'daily'
   * @param {object[]} messages
   * @param {object} usk — full USK snapshot
   */
  save(folderId, mode, messages, usk) {
    if (!folderId || !mode) return
    const key = folderId + ':' + mode
    this.cache[key] = {
      messages: messages || [],
      usk: usk || null,
      timestamp: Date.now(),
    }
  },

  /**
   * Get cached state for a page.
   * Returns null if nothing cached.
   *
   * @param {string} folderId
   * @param {string} mode — 'drama' | 'daily'
   * @returns {{ messages: object[], usk: object|null, timestamp: number } | null}
   */
  get(folderId, mode) {
    if (!folderId || !mode) return null
    const key = folderId + ':' + mode
    return this.cache[key] || null
  },

  /**
   * Load state from a specific folder save.
   * Used when clicking a save in FolderInterior.
   *
   * @param {string} folderId
   * @param {string} saveId — specific save ID
   * @param {string} mode — 'drama' | 'daily' | 'all'
   * @returns {{ dramaMessages?: object[], dailyMessages?: object[], usk: object|null }}
   */
  hydrate(folderId, saveId, mode = 'all') {
    if (!folderId || !saveId) return null

    const save = getSave(saveId, folderId)
    if (!save) return null

    // Load USK from folder
    const usk = loadFolderUSK(folderId)

    const state = {
      usk: usk || null,
    }

    if (mode === 'all' || mode === 'drama') {
      state.dramaMessages = getSaveMessages(saveId, folderId, 'drama')
    }
    if (mode === 'all' || mode === 'daily') {
      state.dailyMessages = getSaveMessages(saveId, folderId, 'daily')
    }

    // Also cache for get() calls
    if (state.dramaMessages) {
      const dKey = folderId + ':drama'
      this.cache[dKey] = { messages: state.dramaMessages, usk, timestamp: Date.now() }
    }
    if (state.dailyMessages) {
      const dKey = folderId + ':daily'
      this.cache[dKey] = { messages: state.dailyMessages, usk, timestamp: Date.now() }
    }

    return state
  },

  /**
   * Check if cached state exists for a folder+mode.
   */
  has(folderId, mode) {
    if (!folderId || !mode) return false
    return !!(this.cache[folderId + ':' + mode])
  },

  /**
   * Clear all cached state.
   */
  clear() {
    this.cache = {}
  },

  /**
   * Clear cached state for a specific folder+mode.
   */
  clearOne(folderId, mode) {
    if (!folderId || !mode) return
    delete this.cache[folderId + ':' + mode]
  },
}

export { HydrationEngine }
