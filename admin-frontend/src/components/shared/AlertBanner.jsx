import clsx from 'clsx'

export default function AlertBanner({ severity = 'warn', message, onAction, actionLabel })
{
    const styles =
    {
        crit: 'bg-error-bg/80 border-accent-red text-accent-red'
        ,warn: 'bg-amber-900/40 border-accent-amber text-accent-amber'
        ,info: 'bg-bg-container border-accent-blue text-accent-blue'
    }

    const icons =
    {
        crit: '!'
        ,warn: '!'
        ,info: 'i'
    }

    return (
        <div className={clsx
        (
            'flex items-center justify-between px-4 py-2 border-l-4 font-mono text-xs shrink-0'
            ,styles[severity]
        )}>
            <div className="flex items-center gap-2">
                <span className="font-bold">{icons[severity]}</span>
                <span>{message}</span>
            </div>
            {onAction && (
                <button
                    onClick={onAction}
                    className="ml-4 px-3 py-1 rounded-sm border border-current hover:bg-white/10 transition-colors text-[10px] font-bold uppercase tracking-wider shrink-0"
                >
                    {actionLabel || 'Analyser'}
                </button>
            )}
        </div>
    )
}
