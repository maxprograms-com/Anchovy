/*******************************************************************************
 * Copyright (c) 2009-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 * Maxprograms - initial API and implementation
 *******************************************************************************/

import { ipcRenderer, IpcRendererEvent } from "electron";

export class SystemInfo {
    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        ipcRenderer.send('get-system-info');
        ipcRenderer.on('set-system-info', (event: IpcRendererEvent, info: { anchovy: string, java: string, xmljava: string, openxliff: string, bcp47j: string, electron: string, typesbcp47: string, typesexcel: string, typesterms: string, typesxliff: string, typesxml: string }) => {
            (document.getElementById('anchovy') as HTMLTableCellElement).innerText = info.anchovy;
            (document.getElementById('openxliff') as HTMLTableCellElement).innerText = info.openxliff;
            (document.getElementById('xmljava') as HTMLTableCellElement).innerText = info.xmljava;
            (document.getElementById('bcp47j') as HTMLTableCellElement).innerText = info.bcp47j;
            (document.getElementById('java') as HTMLTableCellElement).innerText = info.java;
            (document.getElementById('electron') as HTMLTableCellElement).innerText = info.electron;
            (document.getElementById('typesbcp47') as HTMLTableCellElement).innerText = info.typesbcp47;
            (document.getElementById('typesexcel') as HTMLTableCellElement).innerText = info.typesexcel;
            (document.getElementById('typesterms') as HTMLTableCellElement).innerText = info.typesterms;
            (document.getElementById('typesxliff') as HTMLTableCellElement).innerText = info.typesxliff;
            (document.getElementById('typesxml') as HTMLTableCellElement).innerText = info.typesxml;
            setTimeout(() => {
                ipcRenderer.send('set-height', { window: 'systemInfo', width: document.body.clientWidth, height: document.body.clientHeight });
            }, 100);
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-systemInfo');
            }
        });
    }
}
