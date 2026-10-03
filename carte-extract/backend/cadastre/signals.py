from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from projets.models import Prestation

from .operations import sync_projet_lots


@receiver([post_save, post_delete], sender=Prestation)
def keep_lot_operations_in_sync(sender, instance, **kwargs):
    """A prestation was added, renamed or removed: the operation of its projet's lots follows."""
    sync_projet_lots(instance.projet_id)
