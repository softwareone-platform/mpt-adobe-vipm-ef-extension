from typing import override

from mpt_tool.migration import SchemaBaseMigration


class Migration(SchemaBaseMigration):
    """Fake schema migration."""

    @override
    def run(self) -> None:
        self.log.info("Fake schema migration")
