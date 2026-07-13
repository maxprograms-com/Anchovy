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
import { Pair } from "./pair.js";
import { Column, ColumnTypes } from "./model/columnTypes.js";

export class AddColumn {

    columns: Column[] = [];
    languages: Pair[] = [];
    definitions: string[] = [];
    terms: string[] = [];

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        ipcRenderer.on('set-languages', (event: IpcRendererEvent, languages: Pair[]) => {
            this.languages = languages;
            this.setTermLanguages();
        });
        ipcRenderer.on('set-columns', (event: IpcRendererEvent, columns: Column[]) => {
            this.columns = columns;
            for (let column of columns) {
                if (column.type === ColumnTypes.COMMENT) {
                    (document.getElementById('comment') as HTMLInputElement).disabled = true;
                }
                if (column.type === ColumnTypes.TERM) {
                    this.terms.push(column.lang);
                }
                if (column.type === ColumnTypes.DEFINITION) {
                    this.definitions.push(column.lang);
                }
            }
            ipcRenderer.send('get-languages');
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-addColumn');
            }
        });
        (document.getElementById('term') as HTMLInputElement).addEventListener('click', () => {
            this.setTermLanguages();
        });
        (document.getElementById('definition') as HTMLInputElement).addEventListener('click', () => {
            this.setDefinitionLanguages();
        });
        (document.getElementById('comment') as HTMLInputElement).addEventListener('click', () => {
            (document.getElementById('colLanguage') as HTMLSelectElement).disabled = true;
        });

        document.getElementById('addColumn')?.addEventListener('click', () => {
            let comment: boolean = (document.getElementById('comment') as HTMLInputElement).checked;
            let term: boolean = (document.getElementById('term') as HTMLInputElement).checked;
            let definition: boolean = (document.getElementById('definition') as HTMLInputElement).checked;
            let language: string = (document.getElementById('colLanguage') as HTMLSelectElement).value;
            if (term && language === 'none') {
                ipcRenderer.send('show-message', { group: 'addColumn', message: 'selectLanguage' });
                return;
            }
            ipcRenderer.send('add-column', { comment, term, definition, language });
        });
        setTimeout(() => {
            ipcRenderer.send('set-height', { window: 'addColumn', height: document.body.clientHeight, width: document.body.clientWidth });
        }, 100);
    }

    setTermLanguages(): void {
        (document.getElementById('colLanguage') as HTMLSelectElement).disabled = false;
        let sourceSelect: HTMLSelectElement = document.getElementById('colLanguage') as HTMLSelectElement;
        sourceSelect.disabled = false;
        sourceSelect.innerHTML = '';
        for (let lang of this.languages) {
            if (!this.terms.includes(lang.code)) {
                let option: HTMLOptionElement = document.createElement('option');
                option.value = lang.code;
                option.text = lang.description;
                sourceSelect.add(option);
            }
        }
    }

    setDefinitionLanguages(): void {
        let sourceSelect: HTMLSelectElement = document.getElementById('colLanguage') as HTMLSelectElement;
        sourceSelect.disabled = false;
        sourceSelect.innerHTML = '';
        for (let lang of this.languages) {
            if (this.terms.includes(lang.code) && !this.definitions.includes(lang.code)) {
                let option: HTMLOptionElement = document.createElement('option');
                option.value = lang.code;
                option.text = lang.description;
                sourceSelect.add(option);
            }
        }
    }

    setLanguages(languages: Pair[]): void {
        let sourceSelect: HTMLSelectElement = document.getElementById('colLanguage') as HTMLSelectElement;
        for (let lang of languages) {
            let option: HTMLOptionElement = document.createElement('option');
            option.value = lang.code;
            option.text = lang.description;
            sourceSelect.add(option);
        }
    }
}