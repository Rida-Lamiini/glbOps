; Inno Setup script: per-user installer for the Carte desktop app.
; Build: ISCC.exe /DAppVersion=1.0.0 launcher\installer.iss   (see launcher\build_installer.sh)

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{7F3C1B62-5E8A-4D2B-9A61-3C0E4B5D9A11}
AppName=Carte — Globétudes
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
AppPublisher=Globétudes
DefaultDirName={autopf}\Carte Globetudes
DefaultGroupName=Carte Globétudes
DisableProgramGroupPage=yes
; Per-user install: no administrator rights needed (goes under %LOCALAPPDATA%\Programs).
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\dist-installer
OutputBaseFilename=CarteGlobetudes-Setup-{#AppVersion}
SetupIconFile=carte.ico
UninstallDisplayIcon={app}\CarteExtract.exe
UninstallDisplayName=Carte — Globétudes
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"

[Files]
Source: "..\dist-build\CarteExtract.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Carte Globétudes"; Filename: "{app}\CarteExtract.exe"
Name: "{autodesktop}\Carte Globétudes"; Filename: "{app}\CarteExtract.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\CarteExtract.exe"; Description: "Lancer Carte"; Flags: nowait postinstall skipifsilent
; After an in-app update (silent, started with /RELAUNCH=1) the new version opens by itself.
Filename: "{app}\CarteExtract.exe"; Flags: nowait; Check: RelaunchAfterUpdate

[Code]
function RelaunchAfterUpdate: Boolean;
begin
  Result := ExpandConstant('{param:RELAUNCH|0}') = '1';
end;

// The data (database, plans, backups) lives in %LOCALAPPDATA%\CarteExtract, outside the program folder:
// updating or reinstalling never touches it. On uninstall the user chooses whether to delete it too.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{localappdata}\CarteExtract');
    if DirExists(DataDir) then
      if MsgBox('Supprimer aussi les données de Carte (base, plans, sauvegardes) ?' + #13#10 + DataDir + #13#10#13#10 +
                'Choisissez Non pour les conserver (par exemple avant une réinstallation).',
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(DataDir, True, True, True);
  end;
end;
