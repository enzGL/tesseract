; Ganchos do instalador NSIS (reserva do instalador próprio em Tauri, pasta installer/ na raiz).
; Depois de instalar, deixa a marca welcome.pending na pasta de dados: o app mostra a
; boas-vindas na primeira abertura, mesmo quando os dados de antes continuam lá.
!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$APPDATA\dev.tesseract.app"
  FileOpen $0 "$APPDATA\dev.tesseract.app\welcome.pending" w
  FileWrite $0 "1"
  FileClose $0
!macroend
