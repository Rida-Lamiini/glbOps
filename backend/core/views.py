from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import ocr
from .models import Attachment
from .serializers import AttachmentSerializer, UserSerializer


@api_view(['GET'])
def health(request):
    return Response({'status': 'ok'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    data = UserSerializer(user).data
    employee = getattr(user, 'employee', None)
    if employee is not None:
        data['role'] = employee.role
        data['name'] = employee.nom
        data['employee_id'] = employee.id
    else:
        data['role'] = 'Directrice' if user.is_superuser else 'Dispatcher'
        data['name'] = user.first_name or user.username
        data['employee_id'] = None
    return Response(data)


class AttachmentViewSet(viewsets.ModelViewSet):
    queryset = Attachment.objects.select_related('content_type', 'uploaded_by').all()
    serializer_class = AttachmentSerializer

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        instance = serializer.save(uploaded_by=user)
        if instance.file and ocr.is_ocr_eligible(instance.file.name):
            instance.ocr_text = ocr.extract_text(instance.file)
            instance.save(update_fields=["ocr_text"])
