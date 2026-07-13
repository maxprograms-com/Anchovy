/*******************************************************************************
 * Copyright (c) 2009-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { ipcRenderer, IpcRendererEvent } from "electron";

export class Updates {

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            (document.getElementById('theme') as HTMLLinkElement).href = theme;
        });
        ipcRenderer.send('get-versions');
        ipcRenderer.on('set-versions', (event: IpcRendererEvent, versions: { current: string, latest: string }) => {
            (document.getElementById('current') as HTMLTableCellElement).innerText = versions.current;
            (document.getElementById('latest') as HTMLTableCellElement).innerText = versions.latest;
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Enter' || event.code === 'NumpadEnter') {
                ipcRenderer.send('download-latest');
            }
            if (event.code === 'Escape') {
                ipcRenderer.send('close-updates');
            }
        });
        document.getElementById('release')?.addEventListener('click', () => {
            ipcRenderer.send('release-history');
        });
        document.getElementById('download')?.addEventListener('click', () => {
            ipcRenderer.send('download-latest');
        });
        setTimeout(() => {
                ipcRenderer.send('set-height', { window: 'updates', width: document.body.clientWidth, height: document.body.clientHeight });
            }, 200);
    }
}
