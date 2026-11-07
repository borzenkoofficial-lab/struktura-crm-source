; SKOL Liquid Glass installer — keep electron-builder's assisted NSIS flow.
; This file customizes only presentation and inserts one optional feature-tour page.
!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "25282B"

!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!define SKOL_LIME "A4D52F"
!define SKOL_INK "25282B"
!define SKOL_MUTED "687078"

Var SKOLSlideIndex
Var SKOLSlideTitle
Var SKOLSlideBody
Var SKOLSlideCounter
Var SKOLSlideNextButton

Function SKOLSlideRender
  ${If} $SKOLSlideIndex == 0
    ${NSD_SetText} $SKOLSlideTitle "Управление объектами"
    ${NSD_SetText} $SKOLSlideBody "Клиенты, заявки, объекты и история работ собраны в одном рабочем пространстве."
    ${NSD_SetText} $SKOLSlideCounter "01 / 03"
    ${NSD_SetText} $SKOLSlideNextButton "Следующий слайд"
  ${ElseIf} $SKOLSlideIndex == 1
    ${NSD_SetText} $SKOLSlideTitle "Сметы и производство"
    ${NSD_SetText} $SKOLSlideBody "Подготовка расчётов, планирование работ и контроль выполнения — в едином процессе."
    ${NSD_SetText} $SKOLSlideCounter "02 / 03"
    ${NSD_SetText} $SKOLSlideNextButton "Следующий экран"
  ${Else}
    ${NSD_SetText} $SKOLSlideTitle "Финансы и контроль"
    ${NSD_SetText} $SKOLSlideBody "Доходы, расходы, задачи и отчёты доступны локально на вашем компьютере."
    ${NSD_SetText} $SKOLSlideCounter "03 / 03"
    ${NSD_SetText} $SKOLSlideNextButton "Готово — нажмите Далее"
  ${EndIf}
FunctionEnd

Function SKOLSlideNext
  ${If} $SKOLSlideIndex < 2
    IntOp $SKOLSlideIndex $SKOLSlideIndex + 1
    Call SKOLSlideRender
  ${Else}
    Abort
  ${EndIf}
FunctionEnd

Function SKOLFeaturePageCreate
  StrCpy $SKOLSlideIndex 0
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "СКОЛ CRM  /  РАБОЧЕЕ ПРОСТРАНСТВО"
  Pop $1
  ${NSD_CreateLabel} 0 34u 100% 22u "Познакомьтесь с основными возможностями"
  Pop $2
  ${NSD_CreateLabel} 0 66u 100% 22u " "
  Pop $SKOLSlideTitle
  ${NSD_CreateLabel} 0 100u 100% 58u " "
  Pop $SKOLSlideBody
  ${NSD_CreateLabel} 0 172u 40u 14u "01 / 03"
  Pop $SKOLSlideCounter
  ${NSD_CreateButton} 178u 190u 100u 16u "Следующий экран"
  Pop $SKOLSlideNextButton
  ${NSD_OnClick} $SKOLSlideNextButton SKOLSlideNext

  Call SKOLSlideRender
  nsDialogs::Show
FunctionEnd

!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "СКОЛ CRM"
  !define MUI_WELCOMEPAGE_TEXT "Установка локальной системы управления строительными проектами.$\r$\n$\r$\nДанные приложения хранятся на этом компьютере. Перед обновлением рекомендуется создать резервную копию."
  !define MUI_FINISHPAGE_TITLE "СКОЛ CRM готова к работе"
  !define MUI_FINISHPAGE_TEXT "Установка завершена. Запустите СКОЛ CRM, чтобы продолжить работу."
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  Page custom SKOLFeaturePageCreate
!macroend
