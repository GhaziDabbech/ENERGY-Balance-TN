"""
Network topology models: CRC → BCC → Feeder
Represents the physical hierarchy of the Tunisian grid.
"""
from sqlalchemy import Boolean, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CRC(Base):
    __tablename__ = "crcs"

    id:     Mapped[int] = mapped_column(Integer, primary_key=True)
    name:   Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # 'CRC Nord' | 'CRC Sud'
    city:   Mapped[str] = mapped_column(String(64), nullable=False)               # 'La Goulette' | 'Sfax'
    # Split key: percentage of national délestage allocated to this CRC (0-100)
    split_pct: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)

    bccs:  Mapped[list["BCC"]]   = relationship("BCC", back_populates="crc")
    orders:Mapped[list["Order"]] = relationship("Order", back_populates="target_crc",
                                                 foreign_keys="Order.target_crc_id")

    def __repr__(self) -> str:
        return f"<CRC {self.name}>"


class BCC(Base):
    __tablename__ = "bccs"

    id:          Mapped[int]       = mapped_column(Integer, primary_key=True)
    name:        Mapped[str]       = mapped_column(String(64), unique=True, nullable=False)
    zone:        Mapped[str]       = mapped_column(String(128), nullable=False)  # 'Béja & Jendouba'
    crc_id:      Mapped[int]       = mapped_column(Integer, ForeignKey("crcs.id"), nullable=False)
    vhf_canal:   Mapped[str | None]= mapped_column(String(32), nullable=True)    # 'VHF 04-Nord'
    phone:       Mapped[str | None]= mapped_column(String(32), nullable=True)

    crc:         Mapped["CRC"]          = relationship("CRC", back_populates="bccs")
    operators:   Mapped[list["User"]]   = relationship("User", back_populates="bcc")
    feeders:     Mapped[list["Feeder"]] = relationship("Feeder", back_populates="bcc",
                                                        cascade="all, delete-orphan")
    executions:  Mapped[list["Execution"]] = relationship("Execution", back_populates="bcc")

    # Auto-execution mode — when True the scheduler fires planned cuts automatically
    auto_mode:   Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<BCC {self.name}>"


class Feeder(Base):
    """
    HTA feeder (départ MT) belonging to a BCC.
    Priority levels:
      P0 = never shed (hospitals, water stations, national security)
      P1 = shed only in extreme emergency
      P2–P5 = normal délestage candidates (P5 = shed first)
    """
    __tablename__ = "feeders"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True)
    bcc_id:       Mapped[int]      = mapped_column(Integer, ForeignKey("bccs.id", ondelete="CASCADE"),
                                                    nullable=False)
    ref:          Mapped[str]      = mapped_column(String(16), nullable=False)   # 'F07'
    nom:          Mapped[str]      = mapped_column(String(128), nullable=False)  # 'Z.I. Béja Nord'
    poste_source: Mapped[str]      = mapped_column(String(64), nullable=False)   # 'Béja Centre TR1'
    governorate:  Mapped[str|None] = mapped_column(String(100), nullable=True)   # 'Béja'
    mw_nominal:   Mapped[float]    = mapped_column(Float, nullable=False)        # 4.2
    priority:     Mapped[str]      = mapped_column(
        Enum("P0", "P1", "P2", "P3", "P4", "P5", name="feeder_priority"),
        nullable=False,
        default="P4",
    )
    statut:       Mapped[str]      = mapped_column(
        Enum("Actif", "Inactif", "En maintenance", name="feeder_statut"),
        nullable=False,
        default="Actif",
    )

    bcc:          Mapped["BCC"]           = relationship("BCC", back_populates="feeders")
    executions:   Mapped[list["Execution"]] = relationship("Execution", back_populates="feeder")

    def __repr__(self) -> str:
        return f"<Feeder {self.ref} — {self.nom} ({self.priority})>"
