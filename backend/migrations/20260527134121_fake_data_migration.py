from typing import override

from mpt_tool.migration import DataBaseMigration


class Migration(DataBaseMigration):
    """Fake data migration."""

    @override
    def run(self) -> None:
        self.log.info("Fake data migration")
