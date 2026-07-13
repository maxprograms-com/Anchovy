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
import { Pair } from './pair.js';

export class ExtractTerms {

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
            ipcRenderer.send('get-fileTypes');
        });
        ipcRenderer.on('set-fileTypes', (event: IpcRendererEvent, types: { type: string, description: string }[]) => {
            this.setFileTypes(types);
        });
        ipcRenderer.on('set-languages', (event: IpcRendererEvent, languages: Pair[]) => {
            this.setLanguages(languages);
        });
        ipcRenderer.on('set-charsets', (event: IpcRendererEvent, charsets: Pair[]) => {
            this.setCharsets(charsets);
        });
        document.getElementById('browseSource').addEventListener('click', () => {
            ipcRenderer.send('browse-source-file');
        });
        ipcRenderer.on('set-source-file', (event: IpcRendererEvent, filePath: string) => {
            (document.getElementById('sourceFile') as HTMLInputElement).value = filePath;
            let glossmlField: HTMLInputElement = document.getElementById('glossmlFile') as HTMLInputElement;
            if (glossmlField.value.trim() === '') {
                glossmlField.value = filePath.replace(/\.[^/.]+$/, '.gls');
            }
        });
        document.getElementById('browseGlossml')?.addEventListener('click', () => {
            ipcRenderer.send('browse-terms-glossml-target', (document.getElementById('glossmlFile') as HTMLInputElement).value);
        });
        ipcRenderer.on('set-glossml-target', (event: IpcRendererEvent, filePath: string) => {
            (document.getElementById('glossmlFile') as HTMLInputElement).value = filePath;
        });
        ipcRenderer.on('set-file-type', (event: IpcRendererEvent, type: string) => {
            (document.getElementById('typeSelect') as HTMLSelectElement).value = type;
        });
        ipcRenderer.on('set-encoding', (event: IpcRendererEvent, encoding: string) => {
            (document.getElementById('charsetSelect') as HTMLSelectElement).value = encoding;
        });
        document.getElementById('extractTermsButton')?.addEventListener('click', () => {
            this.extractCandidateTerms();
        });
    }

    setCharsets(charsets: Pair[]) {
        let charsetSelect: HTMLSelectElement = document.getElementById('charsetSelect') as HTMLSelectElement;
        for (let charset of charsets) {
            let option: HTMLOptionElement = document.createElement('option');
            option.value = charset.code;
            option.text = charset.description;
            charsetSelect.add(option);
        }
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-extractTerms');
            }
        });
        setTimeout(() => {
            ipcRenderer.send('set-height', { window: 'extractTerms', height: document.body.clientHeight, width: document.body.clientWidth });
        }, 100);
    }

    setFileTypes(types: { type: string; description: string; }[]) {
        let typeSelect: HTMLSelectElement = document.getElementById('typeSelect') as HTMLSelectElement;
        for (let type of types) {
            let option: HTMLOptionElement = document.createElement('option');
            option.value = type.type;
            option.text = type.description;
            typeSelect.add(option);
        }
        ipcRenderer.send('get-languages');
    }

    setLanguages(languages: Pair[]): void {
        let sourceSelect: HTMLSelectElement = document.getElementById('sourceSelect') as HTMLSelectElement;
        for (let lang of languages) {
            let option: HTMLOptionElement = document.createElement('option');
            option.value = lang.code;
            option.text = lang.description;
            sourceSelect.add(option);
        }
        ipcRenderer.send('get-charsets');
    }

    extractCandidateTerms(): void {
        let sourceFile: string = (document.getElementById('sourceFile') as HTMLInputElement).value;
        if (sourceFile.trim() === '') {
            ipcRenderer.send('show-error', { group: 'extractTerms', message: 'selectSourceFile' });
            return;
        }
        let fileType: string = (document.getElementById('typeSelect') as HTMLSelectElement).value;
        if (fileType === 'none') {
            ipcRenderer.send('show-error', { group: 'extractTerms', message: 'selectFileType' });
            return;
        }
        let encoding: string = (document.getElementById('charsetSelect') as HTMLSelectElement).value;
        if (encoding === 'none') {
            ipcRenderer.send('show-error', { group: 'extractTerms', message: 'selectCharacterSet' });
            return;
        }
        let language: string = (document.getElementById('sourceSelect') as HTMLSelectElement).value;
        if (language === 'none') {
            ipcRenderer.send('show-error', { group: 'extractTerms', message: 'selectSourceLanguage' });
            return;
        }
        let frequency: number = Number.parseInt((document.getElementById('frequency') as HTMLInputElement).value);
        if (Number.isNaN(frequency)) {
            ipcRenderer.send('show-error', { group: 'extractTerms', message: 'enterMinFrequency' });
            return;
        }
        let termLength: number = Number.parseInt((document.getElementById('termLength') as HTMLInputElement).value);
        if (Number.isNaN(termLength)) {
            ipcRenderer.send('show-error', { group: 'extractTerms', message: 'enterMaxTermLength' });
            return;
        }
        let glossmlFile: string = (document.getElementById('glossmlFile') as HTMLInputElement).value;
        if (glossmlFile.trim() === '') {
            ipcRenderer.send('show-error', { group: 'extractTerms', message: 'selectGlossmlFile' });
            return;
        }
        ipcRenderer.send('extract-candidates', {
            sourceFile: sourceFile,
            fileType: fileType,
            encoding: encoding,
            language: language,
            frequency: frequency,
            termLength: termLength,
            glossmlFile: glossmlFile
        });
    }

}