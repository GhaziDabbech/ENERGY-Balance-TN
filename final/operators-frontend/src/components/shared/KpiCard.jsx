import clsx from 'clsx'

export default function KpiCard({ label, value, unit, sub, status = null, icon })
{
    return (
        <div className={clsx
        (
            'steg-card flex flex-col gap-1 min-w-0'
            ,status === 'crit' && 'border-accent-red/50 bg-error-bg/10'
            ,status === 'warn' && 'border-accent-amber/40'
            ,status === 'ok'   && 'border-border-subtle'
        )}>

            <div className="flex items-center justify-between">
                <span className="steg-label">{label}</span>
                {icon && <span className="text-text-subtle">{icon}</span>}
            </div>

            <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className={clsx
                (
                    'font-mono text-2xl font-bold leading-none'
                    ,status === 'crit' ? 'text-accent-red'   :
                     status === 'warn' ? 'text-accent-amber' :
                     'text-text-primary'
                )}>
                    {value}
                </span>
                {unit && (
                    <span className="font-mono text-sm text-text-muted">{unit}</span>
                )}
            </div>

            {sub && (
                <span className={clsx
                (
                    'font-mono text-[10px] mt-0.5'
                    ,status === 'crit' ? 'text-accent-red'   :
                     status === 'warn' ? 'text-accent-amber' :
                     'text-text-subtle'
                )}>
                    {sub}
                </span>
            )}
        </div>
    )
}
