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

export class About {
    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        ipcRenderer.send('get-version');
        ipcRenderer.on('set-version', (event: IpcRendererEvent, version: string) => {
            (document.getElementById('version') as HTMLTitleElement).innerText = version;
        });
        document.getElementById('system')?.addEventListener('click', () => {
            ipcRenderer.send('show-system-info');
        });
        document.getElementById('licensesButton')?.addEventListener('click', () => {
            ipcRenderer.send('show-licenses', 'about');
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-about');
            }
        });
        setTimeout(() => {
            ipcRenderer.send('set-height', { window: 'about', height: document.body.clientHeight, width: document.body.clientWidth });
        }, 100);
    }
}