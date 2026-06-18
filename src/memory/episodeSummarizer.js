/**
 * Episode Memory — compressed N-round summaries.
 *
 * Thin wrapper around the existing compressChatHistory function.
 * Adds episode metadata (turn range, index) for structured memory access.
 * Each episode is stored as a system message with isEpisode: true flag.
 */

import { compressChatHistory } from '../utils/deepseek'

/**
 * Create an episode summary from a range of messages.
 * @returns {{ summary: string|null, error: Error|null }}
 */
export async function createEpisodeSummary(messages, apiKey, existingEpisodes, turnStart, turnEnd) {
  // Collect existing episode text for context continuity
  const existingText = existingEpisodes
    .map(ep => ep.content)
    .join('\n\n---\n\n')

  const { summary, structured, error } = await compressChatHistory(messages, apiKey, null, existingText)

  if (error || !summary) {
    return { summary: null, structured: null, error }
  }

  // Store structured data alongside summary for downstream consumers
  // (eventMemory, semanticMemory, coordinator can use structured directly)
  return {
    summary,
    structured,  // v3 structured compression: { events, relationships, skeleton, last_scene, last_reply_verbatim }
    metadata: {
      turnStart,
      turnEnd,
      createdAt: Date.now(),
      eventCount: structured?.events?.length || 0,
      relationshipCount: structured?.relationships ? Object.keys(structured.relationships).length : 0,
    },
    error: null,
  }
}

/**
 * Get all episode messages from the messages array.
 * @returns {Array} messages with isEpisode flag
 */
export function getAllEpisodes(messages) {
  return messages.filter(m =>
    m.role === 'system' &&
    (m.isEpisode || (m.isMemory && m.episodeMetadata))
  )
}

/**
 * Format episodes for prompt injection.
 * Most recent episodes first, limited to maxEpisodes.
 * @returns {string} formatted episode text
 */
export function formatEpisodesForPrompt(episodes, maxEpisodes = 12) {
  if (!episodes || episodes.length === 0) return ''

  const recent = episodes.slice(-maxEpisodes)

  // Group: episodes with structured data get compact formatting
  const parts = recent.map((ep, i) => {
    const meta = ep.episodeMetadata || {}
    const range = meta.turnStart != null
      ? ` [第${meta.turnStart}-${meta.turnEnd}轮]`
      : ''

    // If structured data is available, use compact format
    if (ep.structured) {
      return formatStructuredEpisode(ep.structured, i + 1, range)
    }

    // Fallback: raw content
    return `--- Episode ${i + 1}${range} ---\n${ep.content}`
  })

  return '【剧情摘要——已压缩的历史】\n' + parts.join('\n\n')
}

/**
 * Format a single episode from structured data (compact).
 */
function formatStructuredEpisode(s, index, range) {
  const lines = [`--- Episode ${index}${range} ---`]

  if (s.skeleton?.current_state) {
    lines.push('状态: ' + s.skeleton.current_state)
  }
  if (s.skeleton?.key_events?.length) {
    lines.push('事件: ' + s.skeleton.key_events.join(' | '))
  }
  if (s.events?.length) {
    const evtSummary = s.events.slice(-3).map(e =>
      `[${e.event}] ${e.actor}→${e.target} ${e.affection_delta != null ? (e.affection_delta > 0 ? '+' : '') + e.affection_delta : ''}`
    ).join(' ')
    lines.push('最近: ' + evtSummary)
  }
  if (s.last_scene?.location) {
    lines.push('场景: ' + s.last_scene.location)
  }

  return lines.join('\n')
}

/**
 * Count total episodes.
 */
export function countEpisodes(messages) {
  return getAllEpisodes(messages).length
}

/**
 * Create an episode message object for storage in the messages array.
 * Stores both the human-readable summary AND the structured compression data.
 */
export function createEpisodeMessage(summary, structured, metadata) {
  return {
    role: 'system',
    content: summary,
    structured,  // v3 structured data: { events, relationships, skeleton, last_scene, last_reply_verbatim }
    timestamp: metadata.createdAt || Date.now(),
    isMemory: true,
    isEpisode: true,
    episodeMetadata: {
      turnStart: metadata.turnStart,
      turnEnd: metadata.turnEnd,
      index: metadata.index || 0,
      eventCount: metadata.eventCount || 0,
      relationshipCount: metadata.relationshipCount || 0,
    },
  }
}
