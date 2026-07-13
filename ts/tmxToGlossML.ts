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

import { ipcRenderer, IpcRendererEvent } from 'electron';

export class TmxToGlossML {

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        document.getElementById('browseTmx')?.addEventListener('click', () => {
            ipcRenderer.send('browse-tmx-source');
        });
        ipcRenderer.on('set-tmx-source', (event: IpcRendererEvent, filePath: string) => {
            (document.getElementById('tmxFile') as HTMLInputElement).value = filePath;
            let glossmlField: HTMLInputElement = document.getElementById('glossmlFile') as HTMLInputElement;
            if (glossmlField.value.trim() === '') {
                glossmlField.value = filePath.replace(/\.[^/.]+$/, '.gls');
            }
        });
        document.getElementById('browseGlossml')?.addEventListener('click', () => {
            ipcRenderer.send('browse-tmx-glossml-target', (document.getElementById('glossmlFile') as HTMLInputElement).value);
        });
        ipcRenderer.on('set-glossml-target', (event: IpcRendererEvent, filePath: string) => {
            (document.getElementById('glossmlFile') as HTMLInputElement).value = filePath;
        });
        document.getElementById('convertButton')?.addEventListener('click', () => {
            this.convert();
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-tmxToGlossML');
            }
        });
        setTimeout(() => {
            ipcRenderer.send('set-height', { window: 'tmxToGlossML', height: document.body.clientHeight, width: document.body.clientWidth });
        }, 100);
    }

    convert(): void {
        let tmxFile: string = (document.getElementById('tmxFile') as HTMLInputElement).value;
        if (tmxFile.trim() === '') {
            ipcRenderer.send('show-error', { group: 'tmxToGlossML', message: 'selectTmxFile' });
            return;
        }
        let glossmlFile: string = (document.getElementById('glossmlFile') as HTMLInputElement).value;
        if (glossmlFile.trim() === '') {
            ipcRenderer.send('show-error', { group: 'tmxToGlossML', message: 'selectGlossmlFile' });
            return;
        }
        let openResult: boolean = (document.getElementById('openResult') as HTMLInputElement).checked;
        ipcRenderer.send('convert-tmx-to-glossml', { tmxFile, glossmlFile, openResult });
    }
}
