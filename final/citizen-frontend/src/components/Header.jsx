import {
  LogOut,
  MapPin,
  User,
  Zap,
} from "lucide-react";

function Header({ citizen }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

        {/* Logo */}
        <div className="flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
            <Zap className="h-5 w-5 text-white" />
          </div>

          <div>
            <h1 className="text-lg font-bold text-slate-900">
              ENERGY Balance TN
            </h1>

            <p className="text-xs text-slate-500">
              Citizen Portal
            </p>
          </div>

        </div>

        {/* User information */}
        <div className="flex items-center gap-5">

          {/* Zone */}
          <div className="hidden items-center gap-2 text-sm text-slate-600 sm:flex">
            <MapPin className="h-4 w-4" />
            <span>{citizen.zone}</span>
          </div>

          {/* Profile */}
          <div className="flex items-center gap-2">

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
              <User className="h-4 w-4 text-slate-600" />
            </div>

            <span className="hidden text-sm font-medium md:block">
              {citizen.name}
            </span>

          </div>

          {/* Logout */}
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>

        </div>

      </div>
    </header>
  );
}

export default Header;