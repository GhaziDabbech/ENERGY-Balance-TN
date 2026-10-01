from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id:                   Mapped[int]  = mapped_column(Integer, primary_key=True, index=True)
    username:             Mapped[str]  = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash:        Mapped[str]  = mapped_column(String(128), nullable=False)
    full_name:            Mapped[str]  = mapped_column(String(128), nullable=False)

    # ADMIN | DN | CRC | BCC
    role:                 Mapped[str]  = mapped_column(
        Enum("ADMIN", "DN", "CRC", "BCC", name="user_role"), nullable=False
    )

    # CRC-specific: 'CRC Nord' | 'CRC Sud'
    zone:                 Mapped[str | None] = mapped_column(String(32), nullable=True)

    # BCC-specific: which BCC this operator belongs to
    bcc_id:               Mapped[int | None] = mapped_column(
        Integer, ForeignKey("bccs.id", ondelete="SET NULL"), nullable=True
    )

    is_active:            Mapped[bool] = mapped_column(Boolean, default=True,  nullable=False)

    # Forces a password change on next login (set when admin creates/resets an account)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at:           Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_login:           Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    bcc:           Mapped["BCC | None"]     = relationship("BCC", back_populates="operators")
    issued_orders: Mapped[list["Order"]]    = relationship("Order", back_populates="issued_by_user",
                                                            foreign_keys="Order.issued_by")
    executions:    Mapped[list["Execution"]] = relationship("Execution", back_populates="operator")

    def __repr__(self) -> str:
        return f"<User {self.username} ({self.role})>"

    @property
    def bcc_name(self) -> str | None:
        return self.bcc.name if self.bcc else None

    @property
    def bcc_zone(self) -> str | None:
        return self.bcc.zone if self.bcc else None
