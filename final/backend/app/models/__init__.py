# Import all models here so Alembic autogenerate can detect them
from app.models.network import BCC, CRC, Feeder                        # noqa: F401
from app.models.user import User                                        # noqa: F401
from app.models.order import Order, OrderAck                           # noqa: F401
from app.models.execution import Execution                             # noqa: F401
from app.models.programme import Programme, ProgrammeSlot              # noqa: F401
from app.models.citizen import (                                        # noqa: F401
    CitizenZone, Citizen,
    CitizenProgramSchedule, CitizenExecutionLog,
)
