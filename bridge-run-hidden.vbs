' Launch the cmdgo-bridge supervisor with no visible window (no console, no
' taskbar entry). Drop a copy/shortcut of this file into your Startup folder
' (shell:startup) to start the bridge automatically at logon.
'
' Nothing appears on screen when it works - that is expected.
' Verify with status.cmd or http://127.0.0.1:11435/health
Option Explicit
Dim fso, sh, here
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
sh.Run """" & here & "\bridge-loop.cmd""", 0, False
