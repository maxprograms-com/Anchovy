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

import { ipcRenderer, IpcRendererEvent } from 'electron';

export class BilingualExtractTerms {

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        document.getElementById('browseXliff')?.addEventListener('click', () => {
            ipcRenderer.send('browse-bilingual-xliff');
        });
        ipcRenderer.on('set-bilingual-xliff', (event: IpcRendererEvent, filePath: string) => {
            (document.getElementById('xliffFile') as HTMLInputElement).value = filePath;
            let glossmlField: HTMLInputElement = document.getElementById('glossmlFile') as HTMLInputElement;
            if (glossmlField.value.trim() === '') {
                glossmlField.value = filePath.replace(/\.[^/.]+$/, '.gls');
            }
        });
        document.getElementById('browseGlossml')?.addEventListener('click', () => {
            ipcRenderer.send('browse-bilingual-glossml-target', (document.getElementById('glossmlFile') as HTMLInputElement).value);
        });
        ipcRenderer.on('set-glossml-target', (event: IpcRendererEvent, filePath: string) => {
            (document.getElementById('glossmlFile') as HTMLInputElement).value = filePath;
        });
        document.getElementById('extractBilingualButton')?.addEventListener('click', () => {
            this.extractCandidates();
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-bilingualExtractTerms');
            }
        });
        setTimeout(() => {
            ipcRenderer.send('set-height', { window: 'bilingualExtractTerms', height: document.body.clientHeight, width: document.body.clientWidth });
        }, 100);
    }

    extractCandidates(): void {
        let xliffFile: string = (document.getElementById('xliffFile') as HTMLInputElement).value;
        if (xliffFile.trim() === '') {
            ipcRenderer.send('show-error', { group: 'bilingualExtractTerms', message: 'selectXliffFile' });
            return;
        }
        let frequency: number = Number.parseInt((document.getElementById('frequency') as HTMLInputElement).value);
        if (Number.isNaN(frequency)) {
            ipcRenderer.send('show-error', { group: 'bilingualExtractTerms', message: 'enterMinFrequency' });
            return;
        }
        let termLength: number = Number.parseInt((document.getElementById('termLength') as HTMLInputElement).value);
        if (Number.isNaN(termLength)) {
            ipcRenderer.send('show-error', { group: 'bilingualExtractTerms', message: 'enterMaxTermLength' });
            return;
        }
        let glossmlFile: string = (document.getElementById('glossmlFile') as HTMLInputElement).value;
        if (glossmlFile.trim() === '') {
            ipcRenderer.send('show-error', { group: 'bilingualExtractTerms', message: 'selectGlossmlFile' });
            return;
        }
        ipcRenderer.send('extract-bilingual-candidates', {
            xliffFile: xliffFile,
            frequency: frequency,
            termLength: termLength,
            glossmlFile: glossmlFile
        });
    }
}
