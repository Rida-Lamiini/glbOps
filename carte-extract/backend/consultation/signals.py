from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from projets.models import Projet

from .models import ProximityNotification, SeenProjet
from .notifications import evaluate_projet


@receiver(post_save, sender=Projet)
def projet_saved(sender, instance, **kwargs):
    """A projet was saved: if it is located and new to us, look for neighbours (after the commit)."""
    if instance.boundary or (instance.lat is not None and instance.lng is not None):
        pid = instance.pk
        transaction.on_commit(lambda: _safe_evaluate(pid))


def _safe_evaluate(projet_id):
    try:
        evaluate_projet(projet_id)
    except Exception:  # a proximity hint must never break saving a projet
        import logging

        logging.getLogger(__name__).exception("proximity evaluation failed for %s", projet_id)


@receiver(post_delete, sender=Projet)
def projet_deleted(sender, instance, **kwargs):
    SeenProjet.objects.filter(projet_id=instance.pk).delete()
    ProximityNotification.objects.filter(projet_id=instance.pk).delete()


def notify_when_located(projet_id):
    """For callers that locate a projet indirectly (a lot polygon was just stored)."""
    transaction.on_commit(lambda: _safe_evaluate(projet_id))
