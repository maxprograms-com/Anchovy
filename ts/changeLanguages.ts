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

export class changeLanguages {

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        ipcRenderer.send('get-existing-languages');
        ipcRenderer.on('set-existing-languages', (event: IpcRendererEvent, languages: { code: string, description: string }[]) => {
            this.setLanguages('oldLanguage', languages);
            ipcRenderer.send('get-languages');
        });
        ipcRenderer.on('set-languages', (event: IpcRendererEvent, languages: { code: string, description: string }[]) => {
            this.setLanguages('newLanguage', languages);
            setTimeout(() => {
                ipcRenderer.send('set-height', { window: 'changeLanguages', height: document.body.clientHeight, width: document.body.clientWidth });
            }, 100);
        });
        document.getElementById('save')?.addEventListener('click', () => {
            let oldLanguage: string = (document.getElementById('oldLanguage') as HTMLSelectElement).value;
            let newLanguage: string = (document.getElementById('newLanguage') as HTMLSelectElement).value;
            if (oldLanguage === 'none' || newLanguage === 'none') {
                ipcRenderer.send('show-message', { group: 'changeLanguages', message: 'selectLanguage' });
                return;
            }
            if (oldLanguage === newLanguage) {
                ipcRenderer.send('show-message', { group: 'changeLanguages', message: 'sameLanguage' });
                return;
            }
            ipcRenderer.send('save-languages', { oldLanguage, newLanguage });
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-changeLanguages');
            }
        });
    }

    setLanguages(elementId: string, languages: { code: string, description: string }[]): void {
        let select: HTMLSelectElement = document.getElementById(elementId) as HTMLSelectElement;
        select.innerHTML = '';
        for (let lang of languages) {
            let option: HTMLOptionElement = document.createElement('option');
            option.value = lang.code;
            option.text = lang.description;
            select.add(option);
        }
    }
}