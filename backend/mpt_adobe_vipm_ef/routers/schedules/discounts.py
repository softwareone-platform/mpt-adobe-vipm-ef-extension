import logging

from mpt_extension_sdk.pipeline import ScheduleContext
from mpt_extension_sdk.routing import ScheduleRouter

from mpt_adobe_vipm_ef.services.discount_sync import sync_open_discounts

logger = logging.getLogger(__name__)

discount_schedules_router = ScheduleRouter(prefix="/schedules/discounts")


@discount_schedules_router.task(
    "/open-sync",
    id="schedule.discounts.open-sync",
    name="schedule-discounts-open-sync",
    description="Synchronize the open Adobe flexible discount catalogue into the discount store.",
    cron="0 0 * * *",
)
async def process_open_discount_sync(ctx: ScheduleContext) -> None:
    """Run the daily open discount catalogue synchronization."""
    logger.info("Starting the open discount sync (task=%s)", ctx.meta.task_id)
    await sync_open_discounts(ctx)
