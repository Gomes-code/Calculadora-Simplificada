Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
CurrentDir = FSO.GetParentFolderName(WScript.ScriptFullName)
BatPath = FSO.BuildPath(CurrentDir, "INICIAR_CALCULADORA_TPF.bat")
WshShell.Run Chr(34) & BatPath & Chr(34), 1, False
