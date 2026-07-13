import { useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const memoryCategories = [
  'Preferences',
  'Goals',
  'Businesses',
  'Farm and Ranch',
  'Writing',
  'People',
  'Projects',
  'Important Facts',
]

const sensitivePattern = /(password|passcode|api\s*key|secret|token|private\s*key|credential|account\s*number|routing\s*number|bank\s*account)/i
const longDigitsPattern = /\b\d{10,}\b/

function parseDate(value) {
  if (!value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value) {
  const parsed = parseDate(value)
  if (!parsed) return 'Unknown'

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function detectMemoryCategory(content) {
  const text = content.toLowerCase()

  if (text.includes('prefer') || text.includes('like') || text.includes('favorite')) return 'Preferences'
  if (text.includes('goal') || text.includes('target') || text.includes('plan')) return 'Goals'
  if (text.includes('business') || text.includes('company') || text.includes('revenue')) return 'Businesses'
  if (text.includes('ranch') || text.includes('pasture') || text.includes('livestock') || text.includes('farm')) return 'Farm and Ranch'
  if (text.includes('write') || text.includes('book') || text.includes('story')) return 'Writing'
  if (text.includes('person') || text.includes('contact') || text.includes('family') || text.includes('team')) return 'People'
  if (text.includes('project') || text.includes('milestone') || text.includes('launch')) return 'Projects'

  return 'Important Facts'
}

function extractRememberContent(message) {
  const trimmed = message.trim()

  const match = trimmed.match(/^remember\s+(that|this)\s*[,:-]?\s*(.+)$/i)

  if (!match) return null

  return (match[2] || '').trim()
}

function isSensitiveMemory(content) {
  return sensitivePattern.test(content) || longDigitsPattern.test(content)
}

function getCompanionState({ isListening, isThinking, isSpeaking }) {
  if (isListening) return 'Listening'
  if (isThinking) return 'Thinking'
  if (isSpeaking) return 'Speaking'
  return 'Ready'
}

function createLocalResponse(message, context, memoryCount) {
  const text = message.toLowerCase()

  if (text.includes('priority') || text.includes('today')) {
    return `Top focus for today: ${context.overdueTasks} overdue tasks, ${context.equipmentDue} equipment services due, and ${context.livestockAlerts} livestock alerts. Start with overdue tasks first, then maintenance, then livestock checks.`
  }

  if (text.includes('finance') || text.includes('money') || text.includes('cash')) {
    return `Finance pulse: current month income is ${context.monthlyIncome}, expenses are ${context.monthlyExpenses}, and net is ${context.monthlyNet}.`
  }

  if (text.includes('memory')) {
    return `I currently have ${memoryCount} saved memories for you. Say "Remember that ..." to store new facts intentionally, or use Forget this in the memory panel to delete one.`
  }

  if (text.includes('health') || text.includes('status')) {
    return `System status: ${context.openTasks} open tasks, ${context.equipmentDue} equipment maintenance items due, ${context.overstockedPastures} overstocked pastures, and ${context.activeAiEmployees} active AI employees.`
  }

  return `I am online and ready. I can help summarize tasks, finance, ranch operations, and project memory. Say "Remember that ..." if you want me to save a fact.`
}

function createRealtimeVoiceAdapter() {
  // Placeholder for future realtime AI voice API integration.
  return null
}

function GenesisCompanion() {
  const [userId, setUserId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [memories, setMemories] = useState([])
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [messageNotice, setMessageNotice] = useState('')
  const [memoryNotice, setMemoryNotice] = useState('')
  const [editingMemoryId, setEditingMemoryId] = useState(null)
  const [memoryEdit, setMemoryEdit] = useState({ title: '', category: 'Important Facts', content: '' })
  const [contextSnapshot, setContextSnapshot] = useState({
    openTasks: 0,
    overdueTasks: 0,
    equipmentDue: 0,
    livestockAlerts: 0,
    monthlyIncome: '$0.00',
    monthlyExpenses: '$0.00',
    monthlyNet: '$0.00',
    activeAiEmployees: 0,
    overstockedPastures: 0,
  })

  const recognitionRef = useRef(null)
  const synthesisRef = useRef(null)
  const realtimeAdapterRef = useRef(null)

  const isSupabaseReady = isSupabaseConfigured() && Boolean(supabase)
  const voiceSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const statusText = getCompanionState({ isListening, isThinking, isSpeaking })

  useEffect(() => {
    realtimeAdapterRef.current = createRealtimeVoiceAdapter()
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadData() {
      if (!isSupabaseReady || !supabase) {
        if (!ignore) {
          setMessageNotice('Supabase is not configured. Companion workspace is unavailable.')
          setIsLoading(false)
        }
        return
      }

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError

        const user = userData?.user
        if (!user) {
          if (!ignore) {
            setMessageNotice('Please sign in to use Genesis Companion.')
            setIsLoading(false)
          }
          return
        }

        const [messagesResult, memoriesResult, settingsResult, tasksResult, equipmentResult, livestockResult, financeResult, pasturesResult] = await Promise.all([
          supabase
            .from('companion_messages')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('companion_memories')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false }),
          supabase
            .from('companion_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('tasks')
            .select('*')
            .eq('user_id', user.id),
          supabase
            .from('equipment_records')
            .select('*')
            .eq('user_id', user.id),
          supabase
            .from('livestock_records')
            .select('*')
            .eq('user_id', user.id),
          supabase
            .from('finance_transactions')
            .select('*')
            .eq('user_id', user.id),
          supabase
            .from('pasture_records')
            .select('*')
            .eq('user_id', user.id),
        ])

        const anyError = messagesResult.error
          || memoriesResult.error
          || settingsResult.error
          || tasksResult.error
          || equipmentResult.error
          || livestockResult.error
          || financeResult.error
          || pasturesResult.error

        if (anyError) throw anyError

        const tasks = Array.isArray(tasksResult.data) ? tasksResult.data : []
        const equipment = Array.isArray(equipmentResult.data) ? equipmentResult.data : []
        const livestock = Array.isArray(livestockResult.data) ? livestockResult.data : []
        const finance = Array.isArray(financeResult.data) ? financeResult.data : []
        const pastures = Array.isArray(pasturesResult.data) ? pasturesResult.data : []

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

        const openTasks = tasks.filter((task) => !task.done)
        const overdueTasks = openTasks.filter((task) => {
          const dueDate = parseDate(task.due_date)
          if (dueDate) {
            dueDate.setHours(0, 0, 0, 0)
            return dueDate < today
          }

          const created = parseDate(task.created_at)
          return created ? created.getTime() < today.getTime() - (4 * 24 * 60 * 60 * 1000) : false
        })

        const equipmentDue = equipment.filter((item) => {
          const status = String(item.status || '').toLowerCase()
          if (status === 'maintenance due' || status === 'out of service' || status === 'in repair') return true

          const nextService = parseDate(item.next_service_date)
          if (!nextService) return false
          nextService.setHours(0, 0, 0, 0)
          return nextService <= today
        })

        const livestockAlerts = livestock.filter((item) => {
          const status = String(item.status || '').toLowerCase()
          return status === 'medical' || status === 'quarantine'
        })

        const monthly = finance.filter((item) => String(item.date || '').startsWith(monthKey))
        const monthlyIncomeRaw = monthly
          .filter((item) => item.transaction_type === 'income')
          .reduce((sum, item) => sum + Number(item.amount || 0), 0)
        const monthlyExpensesRaw = monthly
          .filter((item) => item.transaction_type === 'expense')
          .reduce((sum, item) => sum + Number(item.amount || 0), 0)

        const activeAiEmployees = (() => {
          if (typeof window === 'undefined') return 0
          try {
            const raw = window.localStorage.getItem('genesis-os-employee-statuses')
            const parsed = raw ? JSON.parse(raw) : []
            if (!Array.isArray(parsed)) return 0
            return parsed.filter((item) => String(item.status || '').toLowerCase() === 'working').length
          } catch {
            return 0
          }
        })()

        const overstockedPastures = pastures.filter((item) => {
          const cap = Number(item.carrying_capacity)
          const herd = Number(item.current_herd)
          if (Number.isNaN(cap) || Number.isNaN(herd) || cap <= 0) return false
          return herd > cap
        })

        if (!ignore) {
          setUserId(user.id)
          setMessages(Array.isArray(messagesResult.data) ? messagesResult.data : [])
          setMemories(Array.isArray(memoriesResult.data) ? memoriesResult.data : [])
          setMemoryEnabled(settingsResult.data?.memory_enabled ?? true)
          setContextSnapshot({
            openTasks: openTasks.length,
            overdueTasks: overdueTasks.length,
            equipmentDue: equipmentDue.length,
            livestockAlerts: livestockAlerts.length,
            monthlyIncome: Number(monthlyIncomeRaw).toLocaleString(undefined, { style: 'currency', currency: 'USD' }),
            monthlyExpenses: Number(monthlyExpensesRaw).toLocaleString(undefined, { style: 'currency', currency: 'USD' }),
            monthlyNet: Number(monthlyIncomeRaw - monthlyExpensesRaw).toLocaleString(undefined, { style: 'currency', currency: 'USD' }),
            activeAiEmployees,
            overstockedPastures: overstockedPastures.length,
          })
          setIsLoading(false)
        }
      } catch (error) {
        if (ignore) return
        console.error('Failed to load Genesis Companion data.', error)
        setMessageNotice(error?.message || 'Unable to load Genesis Companion right now.')
        setIsLoading(false)
      }
    }

    loadData()

    return () => {
      ignore = true
    }
  }, [isSupabaseReady])

  useEffect(() => {
    if (!voiceSupported) return undefined

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new Recognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.continuous = false

    recognition.onstart = () => {
      setIsListening(true)
      setMessageNotice('Listening... speak now.')
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
      setMessageNotice('Speech recognition had an issue. Try again or type your message.')
    }

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim()

      if (!transcript) return

      setInput(transcript)
      sendMessage(transcript)
    }

    recognitionRef.current = recognition

    return () => {
      recognition.stop()
    }
  }, [voiceSupported])

  function stopSpeech() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  function speakText(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    window.speechSynthesis.cancel()

    const utterance = new window.SpeechSynthesisUtterance(text)
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    synthesisRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }

  function startListening() {
    if (!voiceSupported || !recognitionRef.current) {
      setMessageNotice('Speech recognition is not available in this browser.')
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
      return
    }

    recognitionRef.current.start()
  }

  async function insertMessage(role, content) {
    if (!supabase || !userId) return null

    const { data, error } = await supabase
      .from('companion_messages')
      .insert({ user_id: userId, role, content })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async function rememberFromMessage(originalMessage) {
    const content = extractRememberContent(originalMessage)

    if (!content) {
      return null
    }

    if (!memoryEnabled) {
      return 'Memory is currently turned off in settings, so I did not save that.'
    }

    if (isSensitiveMemory(content)) {
      return 'I will not store sensitive credentials, account numbers, or secret keys.'
    }

    if (!supabase || !userId) {
      return 'I could not save memory because cloud sync is unavailable.'
    }

    const category = detectMemoryCategory(content)
    const title = content.split(/[.!?]/)[0].trim().slice(0, 80) || 'Saved Memory'

    const { data, error } = await supabase
      .from('companion_memories')
      .insert({
        user_id: userId,
        title,
        category,
        content,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    setMemories((current) => [data, ...current])
    setMemoryNotice(`Memory saved: ${title}`)

    return `Saved to memory under ${category}.`
  }

  async function getCompanionReply(userMessage) {
    const endpoint = import.meta.env?.VITE_GENESIS_COMPANION_API_URL
    const memoryCount = memories.length

    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            context: contextSnapshot,
            memoryCount,
          }),
        })

        if (response.ok) {
          const payload = await response.json()
          if (payload?.reply) {
            return String(payload.reply)
          }
        }
      } catch {
        // Fallback to local template below.
      }
    }

    return createLocalResponse(userMessage, contextSnapshot, memoryCount)
  }

  async function sendMessage(rawMessage) {
    const text = (rawMessage ?? input).trim()
    if (!text || isThinking) return

    setInput('')
    setIsThinking(true)
    setMessageNotice('Thinking...')

    try {
      const optimisticUser = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      }

      setMessages((current) => [...current, optimisticUser])

      const persistedUser = await insertMessage('user', text)
      if (persistedUser) {
        setMessages((current) => current.map((item) => (item.id === optimisticUser.id ? persistedUser : item)))
      }

      let memoryOutcome = null
      try {
        memoryOutcome = await rememberFromMessage(text)
      } catch (error) {
        memoryOutcome = error?.message || 'Memory save failed.'
      }

      const reply = await getCompanionReply(text)
      const finalReply = memoryOutcome ? `${reply}\n\n${memoryOutcome}` : reply

      const optimisticAssistant = {
        id: `local-assistant-${Date.now()}`,
        role: 'assistant',
        content: finalReply,
        created_at: new Date().toISOString(),
      }

      setMessages((current) => [...current, optimisticAssistant])

      const persistedAssistant = await insertMessage('assistant', finalReply)
      if (persistedAssistant) {
        setMessages((current) => current.map((item) => (item.id === optimisticAssistant.id ? persistedAssistant : item)))
      }

      speakText(finalReply)
      setMessageNotice('')
    } catch (error) {
      console.error('Failed to send companion message.', error)
      setMessageNotice(error?.message || 'Unable to process your message right now.')
    } finally {
      setIsThinking(false)
    }
  }

  async function toggleMemory(nextValue) {
    setMemoryEnabled(nextValue)

    if (!supabase || !userId) return

    const { error } = await supabase
      .from('companion_settings')
      .upsert({ user_id: userId, memory_enabled: nextValue }, { onConflict: 'user_id' })

    if (error) {
      setMessageNotice(error.message || 'Could not save memory setting.')
    }
  }

  function startMemoryEdit(memory) {
    setEditingMemoryId(memory.id)
    setMemoryEdit({
      title: memory.title || '',
      category: memory.category || 'Important Facts',
      content: memory.content || '',
    })
  }

  async function saveMemoryEdit(memoryId) {
    if (!supabase || !userId) return

    const payload = {
      title: memoryEdit.title.trim() || 'Saved Memory',
      category: memoryEdit.category,
      content: memoryEdit.content.trim(),
      updated_at: new Date().toISOString(),
    }

    if (!payload.content) {
      setMessageNotice('Memory content cannot be empty.')
      return
    }

    const { data, error } = await supabase
      .from('companion_memories')
      .update(payload)
      .eq('id', memoryId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      setMessageNotice(error.message || 'Failed to update memory.')
      return
    }

    setMemories((current) => current.map((item) => (item.id === memoryId ? data : item)))
    setEditingMemoryId(null)
    setMemoryNotice(`Memory updated: ${data.title}`)
  }

  async function deleteMemory(memoryId, label) {
    if (!supabase || !userId) return

    const { error } = await supabase
      .from('companion_memories')
      .delete()
      .eq('id', memoryId)
      .eq('user_id', userId)

    if (error) {
      setMessageNotice(error.message || 'Failed to delete memory.')
      return
    }

    setMemories((current) => current.filter((item) => item.id !== memoryId))
    if (editingMemoryId === memoryId) {
      setEditingMemoryId(null)
    }
    setMemoryNotice(`Forgot: ${label || 'memory entry'}`)
  }

  const statusClass = useMemo(() => {
    if (statusText === 'Listening') return 'working'
    if (statusText === 'Thinking') return 'idle'
    if (statusText === 'Speaking') return 'working'
    return 'offline'
  }, [statusText])

  return (
    <section className="holy-water-page companion-page">
      <div className="hero-panel holy-water-hero">
        <div>
          <p className="eyebrow">Genesis OS Core</p>
          <h1>Genesis Companion</h1>
          <p className="hero-copy">Voice-enabled workspace with intentional memory capture and secure personal context.</p>
        </div>
        <div className="hero-side">
          <div className="clock-card">
            <span className="clock-label">Companion State</span>
            <strong>{statusText}</strong>
            <span>{memoryEnabled ? 'Memory Enabled' : 'Memory Disabled'}</span>
          </div>
        </div>
      </div>

      {memoryNotice ? <p className="holy-water-message">{memoryNotice}</p> : null}
      {messageNotice ? <p className="holy-water-message">{messageNotice}</p> : null}

      <div className="mission holy-water-grid companion-grid">
        <div className="mission-column companion-chat-column">
          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Conversation</h3>
              <span className={`status-badge ${statusClass}`}>{statusText}</span>
            </div>

            <div className="companion-chat-history">
              {isLoading ? (
                <p className="muted-text">Loading chat history...</p>
              ) : messages.length === 0 ? (
                <p className="muted-text">No conversation yet. Ask Genesis Companion anything.</p>
              ) : (
                messages.map((message) => (
                  <article key={message.id} className={`companion-message ${message.role === 'assistant' ? 'assistant' : 'user'}`}>
                    <header>
                      <strong>{message.role === 'assistant' ? 'Genesis Companion' : 'You'}</strong>
                      <small>{formatDate(message.created_at)}</small>
                    </header>
                    <p>{message.content}</p>
                  </article>
                ))
              )}
            </div>

            <form
              className="companion-chat-form"
              onSubmit={(event) => {
                event.preventDefault()
                sendMessage()
              }}
            >
              <textarea
                rows="3"
                placeholder="Message Genesis Companion... (Use: Remember that ... to save memory)"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <div className="companion-chat-actions">
                <button type="button" className="secondary-action" onClick={startListening}>
                  {isListening ? 'Stop Mic' : '🎤 Speak'}
                </button>
                <button type="button" className="secondary-action" onClick={stopSpeech}>
                  Stop Voice
                </button>
                <button type="submit" className="primary-action" disabled={isThinking}>
                  {isThinking ? 'Thinking...' : 'Send'}
                </button>
              </div>
            </form>

            {!voiceSupported ? (
              <p className="muted-text">Speech recognition is not supported in this browser.</p>
            ) : null}
          </div>
        </div>

        <div className="mission-column secondary-stack companion-memory-column">
          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Memory Settings</h3>
              <span className="panel-pill">Safety First</span>
            </div>
            <label className="companion-toggle-row">
              <input
                type="checkbox"
                checked={memoryEnabled}
                onChange={(event) => toggleMemory(event.target.checked)}
              />
              <span>Enable memory saving</span>
            </label>
            <p className="muted-text">Only explicit “Remember that...” entries are stored.</p>
            <p className="muted-text">Passwords, API keys, account numbers, and private credentials are blocked from memory.</p>
          </div>

          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Personal Memory</h3>
              <span className="panel-pill">{memories.length} Items</span>
            </div>

            {memories.length === 0 ? (
              <p className="muted-text">No memories saved yet.</p>
            ) : (
              <div className="companion-memory-list">
                {memories.map((memory) => (
                  <article key={memory.id} className="companion-memory-item">
                    {editingMemoryId === memory.id ? (
                      <>
                        <input
                          type="text"
                          value={memoryEdit.title}
                          onChange={(event) => setMemoryEdit((current) => ({ ...current, title: event.target.value }))}
                          placeholder="Memory title"
                        />
                        <select
                          value={memoryEdit.category}
                          onChange={(event) => setMemoryEdit((current) => ({ ...current, category: event.target.value }))}
                        >
                          {memoryCategories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                        <textarea
                          rows="3"
                          value={memoryEdit.content}
                          onChange={(event) => setMemoryEdit((current) => ({ ...current, content: event.target.value }))}
                        />
                        <div className="companion-memory-actions">
                          <button type="button" className="primary-action" onClick={() => saveMemoryEdit(memory.id)}>Save</button>
                          <button type="button" className="secondary-action" onClick={() => setEditingMemoryId(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <header>
                          <strong>{memory.title}</strong>
                          <span className="panel-pill">{memory.category}</span>
                        </header>
                        <p>{memory.content}</p>
                        <small>Updated {formatDate(memory.updated_at)}</small>
                        <div className="companion-memory-actions">
                          <button type="button" className="secondary-action" onClick={() => startMemoryEdit(memory)}>Edit</button>
                          <button type="button" className="delete-task-btn" onClick={() => deleteMemory(memory.id, memory.title)}>Delete</button>
                          <button type="button" className="delete-task-btn" onClick={() => deleteMemory(memory.id, memory.title)}>Forget this</button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="panel-card">
        <div className="panel-card-header">
          <h3>Companion Context Snapshot</h3>
          <span className="panel-pill">Live Local Template Data</span>
        </div>
        <div className="holy-water-stats">
          <div>
            <span>Open Tasks</span>
            <strong>{contextSnapshot.openTasks}</strong>
          </div>
          <div>
            <span>Overdue Tasks</span>
            <strong>{contextSnapshot.overdueTasks}</strong>
          </div>
          <div>
            <span>Equipment Due</span>
            <strong>{contextSnapshot.equipmentDue}</strong>
          </div>
          <div>
            <span>Livestock Alerts</span>
            <strong>{contextSnapshot.livestockAlerts}</strong>
          </div>
          <div>
            <span>Monthly Net</span>
            <strong>{contextSnapshot.monthlyNet}</strong>
          </div>
          <div>
            <span>Active AI Employees</span>
            <strong>{contextSnapshot.activeAiEmployees}</strong>
          </div>
        </div>
      </section>
    </section>
  )
}

export default GenesisCompanion
