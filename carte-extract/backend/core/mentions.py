"""Resolving "@Full Name" in a comment's text to the employees it mentions."""


def find_mentioned(text, employees):
    """The employees named as ``@<nom>`` in ``text``.

    Longest names are matched first and each matched span is consumed, so "@Salma Idrissi" tags
    Salma Idrissi and not also an employee called "Salma"; a name must not run on into more
    letters ("@Salmane" is not "@Salma"). Case-sensitive, like the frontend autocomplete inserts it.
    """
    text = text or ""
    taken = [False] * len(text)
    found = []
    for employee in sorted(employees, key=lambda e: len(e.nom), reverse=True):
        if not employee.nom:
            continue
        needle = f"@{employee.nom}"
        start = text.find(needle)
        while start != -1:
            end = start + len(needle)
            runs_on = end < len(text) and text[end].isalpha()
            if not runs_on and not any(taken[start:end]):
                for i in range(start, end):
                    taken[i] = True
                found.append(employee)
                break
            start = text.find(needle, start + 1)
    return found
