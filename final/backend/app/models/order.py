"""
Orders: urgence cuts and réalimentation orders.
Flow: DN emits → CRC acknowledges → BCCs execute
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Order(Base):
    __tablename__ = "orders"

    id:            Mapped[int]      = mapped_column(Integer, primary_key=True)
    order_ref:     Mapped[str]      = mapped_column(String(64), unique=True, nullable=False, index=True)

    # 'urgence' = cut more MW immediately
    # 'realim'  = restore MW
    order_type:    Mapped[str]      = mapped_column(
        Enum("urgence", "realim", name="order_type"), nullable=False
    )

    # 'partielle' | 'totale' — only relevant for realim
    sub_type:      Mapped[str | None] = mapped_column(String(16), nullable=True)

    # MW values
    mw_total:      Mapped[float]    = mapped_column(Float, nullable=False)
    mw_nord:       Mapped[float]    = mapped_column(Float, nullable=False, default=0.0)
    mw_sud:        Mapped[float]    = mapped_column(Float, nullable=False, default=0.0)

    # Who issued this order (DN user)
    issued_by:     Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    issued_at:     Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Target CRC (null = both CRCs)
    target_crc_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("crcs.id"), nullable=True
    )

    # Order lifecycle status
    # pending      → emitted by DN, waiting for CRC ack
    # acknowledged → CRC pressed Reçu
    # executing    → BCCs are executing
    # completed    → all BCCs confirmed execution
    # cancelled    → cancelled by a subsequent urgence (contra-order)
    status:        Mapped[str]      = mapped_column(
        Enum("pending", "acknowledged", "executing", "completed", "cancelled",
             name="order_status"),
        nullable=False,
        default="pending",
    )

    # If this order was cancelled by another order (contra-order logic)
    cancelled_by:  Mapped[int | None] = mapped_column(
        Integer, ForeignKey("orders.id"), nullable=True
    )
    cancelled_at:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Audit notes
    notes:         Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    issued_by_user:Mapped["User"]           = relationship("User", back_populates="issued_orders",
                                                            foreign_keys=[issued_by])
    target_crc:    Mapped["CRC | None"]     = relationship("CRC", back_populates="orders",
                                                            foreign_keys=[target_crc_id])
    acks:          Mapped[list["OrderAck"]] = relationship("OrderAck", back_populates="order",
                                                            cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Order {self.order_ref} ({self.order_type} / {self.status})>"


class OrderAck(Base):
    """
    Tracks acknowledgement and execution per CRC/BCC per order.
    One row per (order, user) pair.
    """
    __tablename__ = "order_acks"

    id:            Mapped[int]      = mapped_column(Integer, primary_key=True)
    order_id:      Mapped[int]      = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"),
                                                     nullable=False)
    user_id:       Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    bcc_id:        Mapped[int | None] = mapped_column(Integer, ForeignKey("bccs.id"), nullable=True)

    # MW assigned to this BCC for this order
    mw_assigned:   Mapped[float]    = mapped_column(Float, default=0.0, nullable=False)
    # MW actually executed/restored by this BCC
    mw_executed:   Mapped[float]    = mapped_column(Float, default=0.0, nullable=False)

    # Step 1 — pressed Reçu
    acked_at:      Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Step 2 — confirmed execution
    executed_at:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status:        Mapped[str]      = mapped_column(
        Enum("waiting", "acknowledged", "executing", "completed", "cancelled",
             name="ack_status"),
        nullable=False,
        default="waiting",
    )

    # Relationships
    order:         Mapped["Order"] = relationship("Order", back_populates="acks")
    user:          Mapped["User"]  = relationship("User")
    bcc:           Mapped["BCC | None"] = relationship("BCC")

    def __repr__(self) -> str:
        return f"<OrderAck order={self.order_id} bcc={self.bcc_id} ({self.status})>"
