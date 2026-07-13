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

import { ipcRenderer } from "electron";

export class NewGlossary {

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: Electron.IpcRendererEvent, css: string) => {
            (document.getElementById('theme') as HTMLLinkElement).href = css;
        });
        (document.getElementById('save') as HTMLButtonElement).addEventListener('click', () => {
            this.createGlossary();
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Enter' || event.code === 'NumpadEnter') {
                this.createGlossary();
            }
            if (event.code === 'Escape') {
                ipcRenderer.send('close-newGlossary');
            }
        });
        ipcRenderer.send('get-source-languages');
        ipcRenderer.on('set-languages', (event: Electron.IpcRendererEvent, array: { code: string, description: string }[]) => {
            let select = document.getElementById('sourceLanguage') as HTMLSelectElement;
            select.innerHTML = '';
            for (let lang of array) {
                let option = document.createElement('option');
                option.value = lang.code;
                option.text = lang.description;
                select.add(option);
            }
            setTimeout(() => {
                ipcRenderer.send('set-height', { window: 'newGlossary', width: document.body.clientWidth, height: document.body.clientHeight });
            }, 200);
        });
        (document.getElementById('sourceLanguage') as HTMLSelectElement).focus();
    }

    createGlossary(): any {
        let srcLang: string = (document.getElementById('sourceLanguage') as HTMLSelectElement).value;
        ipcRenderer.send('create-glossary', srcLang);
    }
}