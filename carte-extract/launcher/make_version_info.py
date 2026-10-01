"""Writes launcher/version_info.txt (the Windows file-properties resource of the .exe) from the VERSION file."""

from pathlib import Path

root = Path(__file__).resolve().parent.parent
version = (root / "VERSION").read_text(encoding="utf-8").strip()
parts = [int(p) for p in version.split(".")[:3]] + [0] * (4 - len(version.split(".")[:3]))
tup = tuple(parts[:4])

text = f"""VSVersionInfo(
  ffi=FixedFileInfo(filevers={tup}, prodvers={tup}, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('040C04B0', [
      StringStruct('CompanyName', 'Globétudes'),
      StringStruct('FileDescription', 'Carte — Globétudes'),
      StringStruct('FileVersion', '{version}'),
      StringStruct('InternalName', 'CarteExtract'),
      StringStruct('LegalCopyright', '© Globétudes'),
      StringStruct('OriginalFilename', 'CarteExtract.exe'),
      StringStruct('ProductName', 'Carte — Globétudes'),
      StringStruct('ProductVersion', '{version}')])]),
    VarFileInfo([VarStruct('Translation', [1036, 1200])])
  ]
)
"""
(root / "launcher" / "version_info.txt").write_text(text, encoding="utf-8")
print(version)
