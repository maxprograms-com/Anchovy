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

export class GlossaryInfo {
    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        ipcRenderer.send('get-source-languages');
        ipcRenderer.on('set-languages', (event: IpcRendererEvent, languages: { code: string, description: string }[]) => {
            this.setLanguages(languages);
            ipcRenderer.send('get-glossary-info');
        });
        ipcRenderer.on('set-glossary-info', (event: IpcRendererEvent, info: { srcLang: string, termCount: number, languages: string, comment: string }) => {
            (document.getElementById('srcLang') as HTMLSelectElement).value = info.srcLang;
            (document.getElementById('numTerms') as HTMLTableCellElement).innerText = info.termCount.toString();
            (document.getElementById('languages') as HTMLTableCellElement).innerText = info.languages;
            (document.getElementById('glossaryComment') as HTMLTextAreaElement).value = info.comment;

            setTimeout(() => {
                ipcRenderer.send('set-height', { window: 'glossaryInfo', height: document.body.clientHeight, width: document.body.clientWidth });
            }, 100);
        });
        document.getElementById('save')?.addEventListener('click', () => {
            let srcLang: string = (document.getElementById('srcLang') as HTMLSelectElement).value;
            let comment: string = (document.getElementById('glossaryComment') as HTMLTextAreaElement).value;
            ipcRenderer.send('save-glossary-info', { srcLang, comment });
        });
    }

    setLanguages(languages: { code: string, description: string }[]): void {
        let select: HTMLSelectElement = document.getElementById('srcLang') as HTMLSelectElement;
        select.innerHTML = '';
        for (let lang of languages) {
            let option: HTMLOptionElement = document.createElement('option');
            option.value = lang.code;
            option.text = lang.description;
            select.add(option);
        }
    }
}