from rest_framework import viewsets

from core.permissions import OfficeWriteOrReadOnly

from .models import Conge, Employee
from .serializers import CongeSerializer, EmployeeSerializer


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.prefetch_related("conges").all()
    serializer_class = EmployeeSerializer
    permission_classes = [OfficeWriteOrReadOnly]


class CongeViewSet(viewsets.ModelViewSet):
    queryset = Conge.objects.select_related("employee").all()
    serializer_class = CongeSerializer
    permission_classes = [OfficeWriteOrReadOnly]
