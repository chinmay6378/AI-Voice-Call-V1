from datetime import datetime
from sqlalchemy import Column, DateTime, String
from database.models.call import Base


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(String(4000), nullable=False, default="")
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<AppSetting key={self.key!r}>"
