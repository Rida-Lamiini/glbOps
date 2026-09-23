from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import Client
from .serializers import ClientSerializer


class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        new_id = request.data.get("id")
        # `id` doubles as the "code interne" the office types in by hand — renaming it in place
        # is only safe while nothing references the old value yet: Client.id is a real FK target
        # (projets.client_id, PROTECT), and Django's instance.save() can't rename a primary key —
        # it just inserts a second row under the new id and leaves the old one behind. A plain
        # queryset.update() renames the row correctly, but Postgres still enforces the FK on every
        # existing projet the moment we do it, so this is restricted to clients with no projets yet.
        if new_id and new_id != instance.pk:
            if instance.projets.exists():
                raise ValidationError({"id": "Ce client a déjà des projets liés : son code ne peut plus être changé."})
            if Client.objects.filter(pk=new_id).exists():
                raise ValidationError({"id": "Ce code client est déjà utilisé."})
            Client.objects.filter(pk=instance.pk).update(id=new_id)
            instance = Client.objects.get(pk=new_id)

        # Mirror UpdateModelMixin.update() but against `instance` above, since its pk may have
        # just changed — self.get_object() would re-look-up the URL's (now stale) pk otherwise.
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.get("partial", False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
