from django.test import SimpleTestCase

from .geo.calculations import planar_perimeter_m, planar_shoelace_area_m2
from .pdf.parse_bornes import parse_calcul_de_contenances

# A clean 100 m x 50 m rectangle in Lambert coordinates.
SQUARE = [(500000.0, 300000.0), (500100.0, 300000.0), (500100.0, 300050.0), (500000.0, 300050.0)]


class GeometryTests(SimpleTestCase):
    def test_shoelace_area_of_a_rectangle(self):
        self.assertAlmostEqual(planar_shoelace_area_m2(SQUARE), 5000.0, places=6)

    def test_perimeter_closes_the_ring(self):
        self.assertAlmostEqual(planar_perimeter_m(SQUARE), 300.0, places=6)


class ParserTests(SimpleTestCase):
    def test_parses_borne_rows_in_document_order(self):
        text = "313952,15 B3452 377797,12\n313980,44 B3453 377810,30\n313990,10 B3454 377750,00"
        parsed = parse_calcul_de_contenances(text)
        self.assertEqual([b.name for b in parsed.bornes], ["B3452", "B3453", "B3454"])
        self.assertEqual(parsed.bornes[0].x, 313952.15)
        self.assertEqual(parsed.bornes[0].y, 377797.12)

    def test_flags_a_borne_whose_name_is_not_a_clean_reading(self):
        text = "313952,15 B3452 377797,12\n313980,44 83453 377810,30\n313990,10 B3454 377750,00"
        parsed = parse_calcul_de_contenances(text)
        self.assertTrue(parsed.bornes[1].flagged)

    def test_flags_a_coordinate_with_an_inserted_digit(self):
        text = (
            "313952,15 B3452 377797,12\n"
            "313980,44 B3453 377810,30\n"
            "3139900,10 B3454 377750,00\n"
            "313995,00 B3455 377760,00"
        )
        parsed = parse_calcul_de_contenances(text)
        self.assertTrue(any(b.flagged for b in parsed.bornes))

    def test_a_number_does_not_bleed_across_a_line_break(self):
        text = "P 56\n300602,65 B3452 377797,12"
        parsed = parse_calcul_de_contenances(text)
        self.assertEqual(parsed.bornes[0].x, 300602.65)
