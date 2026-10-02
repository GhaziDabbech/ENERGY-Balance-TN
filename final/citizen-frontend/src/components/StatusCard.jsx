import {
  CheckCircle2,
  Power,
} from "lucide-react";

function StatusCard({ status }) {
  const isAvailable = status.status === "available";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">

        {/* Status */}
        <div className="flex items-center gap-4">

          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <Power className="h-7 w-7 text-emerald-600" />
          </div>

          <div>

            <p className="text-sm text-slate-500">
              Current electricity status
            </p>

            <div className="mt-1 flex items-center gap-2">

              {isAvailable && (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              )}

              <span className="text-xl font-bold text-slate-900">
                {status.label}
              </span>

            </div>

            <p className="mt-1 text-sm text-slate-500">
              {status.description}
            </p>

          </div>

        </div>

      </div>

    </section>
  );
}

export default StatusCard;