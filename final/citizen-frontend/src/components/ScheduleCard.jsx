import {
  CalendarDays,
  Clock3,
} from "lucide-react";

function ScheduleCard({ schedule }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">

        <div>
          <h3 className="font-semibold text-slate-900">
            Tomorrow's schedule
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Planned interruptions for your zone
          </p>
        </div>

        <CalendarDays className="h-5 w-5 text-slate-400" />

      </div>

      {/* Schedule items */}
      <div className="space-y-3">

        {schedule.map((item) => (
          <div
            key={item.id}
            className="flex flex-col justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center"
          >

            {/* Time */}
            <div className="flex items-center gap-4">

              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">
                  {item.start}
                </p>

                <p className="text-xs text-slate-400">
                  start
                </p>
              </div>

              <div className="h-px w-8 bg-slate-300" />

              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">
                  {item.end}
                </p>

                <p className="text-xs text-slate-400">
                  end
                </p>
              </div>

            </div>

            {/* Duration / status */}
            <div className="flex items-center gap-4">

              <div className="flex items-center gap-1 text-sm text-slate-500">
                <Clock3 className="h-4 w-4" />
                {item.duration} min
              </div>

              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium capitalize text-amber-700">
                {item.status}
              </span>

            </div>

          </div>
        ))}

      </div>

    </section>
  );
}

export default ScheduleCard;