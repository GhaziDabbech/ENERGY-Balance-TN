import Header from "../components/Header";
import StatusCard from "../components/StatusCard";
import ScheduleCard from "../components/ScheduleCard";

import {
  citizen,
  electricityStatus,
  schedule,
} from "../data/mockData";

function CitizenDashboard() {
  return (
    <div className="min-h-screen bg-slate-50">

      <Header citizen={citizen} />

      <main className="mx-auto max-w-7xl px-6 py-8">

        {/* Welcome */}
        <div className="mb-8">

          <h2 className="text-2xl font-bold text-slate-900">
            Welcome back, {citizen.name.split(" ")[0]}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Here is the latest electricity information for your area.
          </p>

        </div>

        {/* Current status */}
        <StatusCard status={electricityStatus} />

        {/* Schedule */}
        <div className="mt-6">
          <ScheduleCard schedule={schedule} />
        </div>

      </main>

    </div>
  );
}

export default CitizenDashboard;