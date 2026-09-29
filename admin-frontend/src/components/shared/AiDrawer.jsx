import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

export default function AiDrawer({ isOpen, onClose, context })
{
    const token = useAuthStore(state => state.token)
    const [messages, setMessages] = useState
    (
        [{ role: 'system', text: "Bonjour ! Je suis l'assistant IA ENERGY Balance TN. Comment puis-je vous aider ?" }]
    )
    const [input, setInput] = useState('')

    const send = async () =>
    {
        if (!input.trim()) return

        const userText = input
        setInput('')
        
        setMessages((m) => [
            ...m,
            { role: 'user', text: userText },
            { role: 'system', text: 'Analyse en cours...' }
        ])

        try {
            const history = messages.map(m => ({
                role: m.role === 'system' ? 'assistant' : 'user',
                content: m.text,
                text: m.text
            }))

            const response = await axios.post(
                'http://localhost:8000/api/v1/chat/admin',
                { message: userText, history: history },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            setMessages((m) => {
                const newM = [...m]
                newM[newM.length - 1] = { role: 'system', text: response.data.reply }
                return newM
            })
        } catch (error) {
            console.error(error)
            setMessages((m) => {
                const newM = [...m]
                newM[newM.length - 1] = { role: 'system', text: "⚠️ Erreur de connexion à l'IA." }
                return newM
            })
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed right-0 top-12 bottom-6 w-96 bg-bg-surface border-l border-border-subtle z-50 flex flex-col shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-bg-container border-b border-border-subtle shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-accent-blue font-bold font-mono text-sm">IA</span>
                    <span className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
                        Analyse IA — {context || 'Deficit national'}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="text-text-subtle hover:text-text-primary transition-colors font-mono"
                >
                    X
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {messages.map
                (
                    (m, i) => (
                        <div
                            key={i}
                            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`max-w-[85%] rounded-sm px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap ${
                                m.role === 'user'
                                    ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                                    : 'bg-bg-container text-text-muted border border-border-subtle'
                            }`}>
                                {m.text}
                            </div>
                        </div>
                    )
                )}
            </div>

            {/* Disclaimer */}
            <div className="px-4 py-1 font-mono text-[9px] text-text-subtle text-center border-t border-border-subtle shrink-0">
                Les suggestions IA sont indicatives. La decision finale reste a l'operateur.
            </div>

            {/* Input */}
            <div className="flex gap-2 p-3 border-t border-border-subtle shrink-0">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                    placeholder="Posez une question..."
                    className="steg-input text-xs"
                />
                <button
                    onClick={send}
                    className="steg-btn-primary px-3 py-2 text-xs shrink-0"
                >
                    Envoyer
                </button>
            </div>
        </div>
    )
}
