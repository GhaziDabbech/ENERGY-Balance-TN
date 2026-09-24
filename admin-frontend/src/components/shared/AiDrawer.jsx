import { useState } from 'react'

const MOCK_RESPONSE =
`Analyse du deficit national (-38,5 MW) :

-> BCC 3 Nord-Ouest : -12 MW depuis 35 min suite a l'avarie disjoncteur D22 a Beja. Aucun depart P3/P4 disponible non encore delestes dans ce secteur.

-> BCC 5 Centre : -16,5 MW. Rotation anti-repetition bloque les departs F07 et F12 (coupure il y a < 24h). Departs P4/P5 mobilisables : F19 Oueslatia (7,5 MW) et F23 Haffouz (5 MW).

Recommandation : Envoyer ordre correctif a BCC 4 (+8 MW compensation) et BCC 6 (+2 MW). Retablissement estime sous 6 minutes.`

export default function AiDrawer({ isOpen, onClose, context })
{
    const [messages, setMessages] = useState
    (
        [{ role: 'system', text: MOCK_RESPONSE }]
    )
    const [input, setInput] = useState('')

    const send = () =>
    {
        if (!input.trim()) return

        setMessages
        (
            (m) =>
            [
                ...m
                ,{ role: 'user',   text: input }
                ,{ role: 'system', text: 'Analyse en cours... (reponse simulee pour la demo)' }
            ]
        )
        setInput('')
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
