"""Stage rules for a prestation: which moves are valid, who may make them, and how long a
prestation may sit in a stage before it is flagged. Mirrors what the drawer offers
(``PrestationDrawer.jsx``) and ``canAct`` in ``frontend/src/utils/access.js``."""
from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from core.permissions import OFFICE_ROLES, is_office

# stage -> stages it may move to. Forward along the pipeline, plus the two ways back:
# the dispatcher's reprogramming (execution -> affectation) and a non-conformity returned
# by bureau / contrôle (to bureau or to the field).
TRANSITIONS = {
    "demande": ["prestation"],
    "prestation": ["affectation"],
    "affectation": ["execution"],
    "execution": ["bureau", "affectation"],
    "bureau": ["controle", "execution"],
    "controle": ["livraison", "bureau", "execution"],
    "livraison": [],
}

# stage -> the roles that operate it. The office may move any stage (it approves
# reprogramming and covers for absent agents), so it is not listed per stage.
STAGE_OWNERS = {
    "demande": OFFICE_ROLES,
    "prestation": OFFICE_ROLES,
    "affectation": {"Agent Chantier"},
    "execution": {"Agent Chantier"},
    "bureau": {"Agent Bureau"},
    "controle": {"Agent Contrôle"},
    "livraison": OFFICE_ROLES,
}

# Working days a prestation may stay in a stage before it counts as late. A starting point to
# tune with the team; "livraison" is the end of the line and never late.
SLA_DAYS = {
    "demande": 2,
    "prestation": 3,
    "affectation": 7,
    "execution": 5,
    "bureau": 10,
    "controle": 3,
}
# Flagged "à risque" once this share of the allowance is used up.
AT_RISK_SHARE = 0.75


def check_transition(user, current, target):
    """Raise unless ``user`` may move a prestation from ``current`` to ``target``."""
    if target == current or user.is_superuser:
        return
    if target not in TRANSITIONS.get(current, []):
        raise ValidationError({"stage": f"Passage impossible de « {current} » à « {target} »."})
    if is_office(user):
        return
    employee = getattr(user, "employee", None)
    if employee is None or employee.role not in STAGE_OWNERS.get(current, set()):
        raise PermissionDenied("Cette étape n'est pas la vôtre.")


def _working_days_between(start, end):
    """Whole days from ``start`` to ``end`` (dates), weekends left out."""
    days = 0
    day = start
    while day < end:
        day += timedelta(days=1)
        if day.weekday() < 5:
            days += 1
    return days


def sla_info(stage, stage_since, now=None):
    """(age in working days, allowance, status) for a prestation sitting in ``stage`` since
    ``stage_since``. Status is 'ok' | 'risque' | 'retard', or None when there is nothing to
    measure (delivered, or the entry time is unknown)."""
    allowance = SLA_DAYS.get(stage)
    if allowance is None or stage_since is None:
        return None, allowance, None
    today = timezone.localdate(now)
    age = _working_days_between(timezone.localtime(stage_since).date(), today)
    if age > allowance:
        status = "retard"
    elif age >= allowance * AT_RISK_SHARE:
        status = "risque"
    else:
        status = "ok"
    return age, allowance, status
