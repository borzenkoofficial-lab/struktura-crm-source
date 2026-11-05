; СКОЛ — фирменный мастер установки.
; Основа остаётся на штатном NSIS от electron-builder: это сохраняет обновление,
; корректное удаление и совместимость с уже установленной CRM.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "1E2520"
!define MUI_HEADER_TRANSPARENT
!define MUI_WELCOMEPAGE_TITLE "Добро пожаловать в СКОЛ"
!define MUI_WELCOMEPAGE_TEXT "Единая система управления строительными объектами, заявками, сметами и производством.$\r$\n$\r$\nПеред установкой можно посмотреть короткую презентацию возможностей программы."

!ifndef BUILD_UNINSTALLER
Var SkolSlideIndex
Var SkolSlideHeading
Var SkolSlideBody
Var SkolSlideCounter
Var SkolSlidePrev
Var SkolSlideNext

!macro customHeader
  !define MUI_ABORTWARNING
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
  Page custom SkolSlidesPageCreate SkolSlidesPageLeave
!macroend

Function SkolSlideUpdate
  ${If} $SkolSlideIndex == 0
    ${NSD_SetText} $SkolSlideHeading "Все процессы в одном месте"
    ${NSD_SetText} $SkolSlideBody "Заявки и клиенты, объекты, задачи и документы собраны в одной рабочей системе.\r\n\r\nНе нужно держать управление объектом в десятках разрозненных таблиц."
    ${NSD_SetText} $SkolSlideCounter "01 / 03     ОБЪЕКТЫ И ЗАЯВКИ"
  ${ElseIf} $SkolSlideIndex == 1
    ${NSD_SetText} $SkolSlideHeading "Сметы и экономика работ"
    ${NSD_SetText} $SkolSlideBody "Рассчитывайте стоимость, материалы, трудозатраты и коммерческие предложения.\r\n\r\nДанные объекта используются в связанных разделах CRM."
    ${NSD_SetText} $SkolSlideCounter "02 / 03     СМЕТЫ И ФИНАНСЫ"
  ${Else}
    ${NSD_SetText} $SkolSlideHeading "Производство под контролем"
    ${NSD_SetText} $SkolSlideBody "Планируйте работы, отслеживайте выполнение и фиксируйте результаты по объектам.\r\n\r\nСКОЛ — настольная программа с локальным хранением рабочей базы."
    ${NSD_SetText} $SkolSlideCounter "03 / 03     ПРОИЗВОДСТВО"
  ${EndIf}
  ${If} $SkolSlideIndex == 0
    EnableWindow $SkolSlidePrev 0
  ${Else}
    EnableWindow $SkolSlidePrev 1
  ${EndIf}
  ${If} $SkolSlideIndex == 2
    ${NSD_SetText} $SkolSlideNext "Продолжить установку"
  ${Else}
    ${NSD_SetText} $SkolSlideNext "Следующий слайд"
  ${EndIf}
FunctionEnd

Function SkolSlidePrevious
  ${If} $SkolSlideIndex > 0
    IntOp $SkolSlideIndex $SkolSlideIndex - 1
    Call SkolSlideUpdate
  ${EndIf}
FunctionEnd

Function SkolSlideAdvance
  ${If} $SkolSlideIndex < 2
    IntOp $SkolSlideIndex $SkolSlideIndex + 1
    Call SkolSlideUpdate
  ${Else}
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${BM_CLICK} 0 0
  ${EndIf}
FunctionEnd

Function SkolSlidesPageCreate
  StrCpy $SkolSlideIndex 0
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 5u 100% 16u "ВОЗМОЖНОСТИ СКОЛ"
  Pop $1
  SetCtlColors $1 "6B786D" "FFFFFF"

  ${NSD_CreateLabel} 0 27u 100% 24u ""
  Pop $SkolSlideHeading
  SetCtlColors $SkolSlideHeading "1E2520" "FFFFFF"

  ${NSD_CreateLabel} 0 58u 100% 48u ""
  Pop $SkolSlideBody
  SetCtlColors $SkolSlideBody "59645B" "FFFFFF"

  ${NSD_CreateLabel} 0 116u 100% 12u ""
  Pop $SkolSlideCounter
  SetCtlColors $SkolSlideCounter "52604F" "EFFFCE"

  ${NSD_CreateButton} 0 142u 34% 16u "Назад"
  Pop $SkolSlidePrev
  ${NSD_OnClick} $SkolSlidePrev SkolSlidePrevious

  ${NSD_CreateButton} 66% 142u 34% 16u "Следующий слайд"
  Pop $SkolSlideNext
  ${NSD_OnClick} $SkolSlideNext SkolSlideAdvance

  Call SkolSlideUpdate
  nsDialogs::Show
FunctionEnd

Function SkolSlidesPageLeave
FunctionEnd
!endif
