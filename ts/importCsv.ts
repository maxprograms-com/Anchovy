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

export class ImportCsv {

    csvFile: string = '';
    rows: string[][] = [];
    columnCount: number = 0;
    consistent: boolean = false;
    languages: Pair[] = [];
    columnTypes: string[] = [];
    columnLangs: string[] = [];
    anyLanguageLabel: string = '';
    inconsistentMessage: string = '';
    columnLabel: string = 'Column {0}';
    typeLabels: { skip: string, comment: string, term: string, definition: string } = { skip: 'Skip', comment: 'Comment', term: 'Term', definition: 'Definition' };
    headerPatterns: { comment: string, term: string, definition: string } = { comment: 'Comment', term: 'Term ({0})', definition: 'Definition ({0})' };

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        ipcRenderer.on('set-csv-import-data', (event: IpcRendererEvent, data: { anyLanguageLabel: string, inconsistentMessage: string, columnLabel: string, typeLabels: { skip: string, comment: string, term: string, definition: string }, headerPatterns: { comment: string, term: string, definition: string } }) => {
            this.anyLanguageLabel = data.anyLanguageLabel;
            this.inconsistentMessage = data.inconsistentMessage;
            this.columnLabel = data.columnLabel;
            this.typeLabels = data.typeLabels;
            this.headerPatterns = data.headerPatterns;
            this.populateSourceLanguage();
        });
        document.getElementById('browseCsv')?.addEventListener('click', () => {
            ipcRenderer.send('browse-csv-source');
        });
        ipcRenderer.on('set-csv-source', (event: IpcRendererEvent, data: { sourceFile: string, detectedEncoding: string, detectedSeparator: string, detectedQuote: string }) => {
            this.csvFile = data.sourceFile;
            (document.getElementById('csvFile') as HTMLInputElement).value = data.sourceFile;
            this.applyDetectedSettings(data.detectedEncoding, data.detectedSeparator, data.detectedQuote);
            let glossmlField: HTMLInputElement = document.getElementById('glossmlFile') as HTMLInputElement;
            if (glossmlField.value.trim() === '') {
                glossmlField.value = data.sourceFile.replace(/\.[^/.]+$/, '.gls');
            }
            this.refreshPreview();
        });
        document.getElementById('browseGlossml')?.addEventListener('click', () => {
            ipcRenderer.send('browse-csv-glossml-target', (document.getElementById('glossmlFile') as HTMLInputElement).value);
        });
        ipcRenderer.on('set-glossml-target', (event: IpcRendererEvent, filePath: string) => {
            (document.getElementById('glossmlFile') as HTMLInputElement).value = filePath;
        });
        ipcRenderer.send('get-languages');
        ipcRenderer.on('set-languages', (event: IpcRendererEvent, languages: Pair[]) => {
            this.languages = languages.filter((lang: Pair) => lang.code !== 'none');
            this.populateSourceLanguage();
            this.refreshPreview();
        });
        ipcRenderer.on('set-csv-preview', (event: IpcRendererEvent, data: { rows: string[][], columnCount: number, consistent: boolean, error?: string }) => {
            this.applyPreview(data);
        });
        for (let id of ['encodingSelect', 'columnSeparator', 'textDelimiter']) {
            (document.getElementById(id) as HTMLSelectElement).addEventListener('change', () => {
                this.refreshPreview();
            });
        }
        for (let id of ['customSeparator', 'customDelimiter']) {
            (document.getElementById(id) as HTMLInputElement).addEventListener('input', () => {
                this.refreshPreview();
            });
        }
        (document.getElementById('hasHeaderRow') as HTMLInputElement).addEventListener('change', () => {
            this.refreshPreview();
        });
        (document.getElementById('importButton') as HTMLButtonElement).addEventListener('click', () => {
            this.doImport();
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-importCsv');
            }
        });
        setTimeout(() => {
            this.sendHeight();
        }, 100);
    }

    populateSourceLanguage(): void {
        let select: HTMLSelectElement = document.getElementById('sourceLanguage') as HTMLSelectElement;
        select.innerHTML = '';
        let anyLanguage: HTMLOptionElement = document.createElement('option');
        anyLanguage.value = '*all*';
        anyLanguage.text = this.anyLanguageLabel;
        select.add(anyLanguage);
        for (let lang of this.languages) {
            let option: HTMLOptionElement = document.createElement('option');
            option.value = lang.code;
            option.text = lang.description;
            select.add(option);
        }
    }

    applyDetectedSettings(encoding: string, separator: string, quote: string): void {
        let encodingSelect: HTMLSelectElement = document.getElementById('encodingSelect') as HTMLSelectElement;
        if (Array.from(encodingSelect.options).some((option: HTMLOptionElement) => option.value === encoding)) {
            encodingSelect.value = encoding;
        }

        let separatorSelect: HTMLSelectElement = document.getElementById('columnSeparator') as HTMLSelectElement;
        let customSeparator: HTMLInputElement = document.getElementById('customSeparator') as HTMLInputElement;
        let separatorPreset: string = separator === '\t' ? 'TAB' : separator;
        if (Array.from(separatorSelect.options).some((option: HTMLOptionElement) => option.value === separatorPreset)) {
            separatorSelect.value = separatorPreset;
            customSeparator.value = '';
        } else {
            customSeparator.value = separator;
        }

        let delimiterSelect: HTMLSelectElement = document.getElementById('textDelimiter') as HTMLSelectElement;
        let customDelimiter: HTMLInputElement = document.getElementById('customDelimiter') as HTMLInputElement;
        if (Array.from(delimiterSelect.options).some((option: HTMLOptionElement) => option.value === quote)) {
            delimiterSelect.value = quote;
            customDelimiter.value = '';
        } else {
            customDelimiter.value = quote;
        }
    }

    getColumnSeparator(): string {
        let custom: string = (document.getElementById('customSeparator') as HTMLInputElement).value;
        if (custom !== '') {
            return custom;
        }
        let preset: string = (document.getElementById('columnSeparator') as HTMLSelectElement).value;
        return preset === 'TAB' ? '\t' : preset;
    }

    getTextDelimiter(): string {
        let custom: string = (document.getElementById('customDelimiter') as HTMLInputElement).value;
        if (custom !== '') {
            return custom;
        }
        return (document.getElementById('textDelimiter') as HTMLSelectElement).value;
    }

    refreshPreview(): void {
        if (!this.csvFile) {
            return;
        }
        ipcRenderer.send('get-csv-preview', {
            encoding: (document.getElementById('encodingSelect') as HTMLSelectElement).value,
            columnSeparator: this.getColumnSeparator(),
            textDelimiter: this.getTextDelimiter()
        });
    }

    applyPreview(data: { rows: string[][], columnCount: number, consistent: boolean, error?: string }): void {
        this.rows = data.rows;
        this.columnCount = data.columnCount;
        this.consistent = data.consistent;

        let status: HTMLDivElement = document.getElementById('csvStatus') as HTMLDivElement;
        let importButton: HTMLButtonElement = document.getElementById('importButton') as HTMLButtonElement;
        if (data.error) {
            status.innerText = data.error;
            status.style.color = 'red';
            importButton.disabled = true;
        } else if (!this.consistent) {
            status.innerText = this.inconsistentMessage;
            status.style.color = 'red';
            importButton.disabled = true;
        } else {
            status.innerText = '';
            importButton.disabled = false;
        }

        this.renderPreviewGrid();
        if (this.consistent) {
            this.renderMapping();
        } else {
            this.clearMapping();
        }
        this.sendHeight();
    }

    sendHeight(): void {
        ipcRenderer.send('set-height', { window: 'importCsv', width: document.body.clientWidth, height: document.body.clientHeight });
    }

    clearMapping(): void {
        (document.getElementById('columnHeaderRow') as HTMLTableRowElement).innerHTML = '';
        (document.getElementById('typeRow') as HTMLTableRowElement).innerHTML = '';
        (document.getElementById('langRow') as HTMLTableRowElement).innerHTML = '';
        this.columnTypes = [];
        this.columnLangs = [];
    }

    renderMapping(): void {
        this.columnTypes = new Array(this.columnCount).fill('skip');
        this.columnLangs = new Array(this.columnCount).fill('');

        let headerRow: HTMLTableRowElement = document.getElementById('columnHeaderRow') as HTMLTableRowElement;
        let typeRow: HTMLTableRowElement = document.getElementById('typeRow') as HTMLTableRowElement;
        let langRow: HTMLTableRowElement = document.getElementById('langRow') as HTMLTableRowElement;
        headerRow.innerHTML = '';
        typeRow.innerHTML = '';
        langRow.innerHTML = '';

        for (let i = 0; i < this.columnCount; i++) {
            let th: HTMLTableCellElement = document.createElement('th');
            th.innerText = this.columnLabel.replace('{0}', '' + (i + 1));
            this.constrainCellWidth(th);
            headerRow.appendChild(th);

            let typeCell: HTMLTableCellElement = document.createElement('td');
            this.constrainCellWidth(typeCell);
            let typeSelect: HTMLSelectElement = document.createElement('select');
            typeSelect.id = 'type_' + i;
            typeSelect.className = 'table_select';
            typeSelect.style.width = '100%';
            for (let option of [{ value: 'skip', text: this.typeLabels.skip }, { value: 'comment', text: this.typeLabels.comment }, { value: 'term', text: this.typeLabels.term }, { value: 'definition', text: this.typeLabels.definition }]) {
                let optionElement: HTMLOptionElement = document.createElement('option');
                optionElement.value = option.value;
                optionElement.text = option.text;
                typeSelect.add(optionElement);
            }
            typeSelect.addEventListener('change', () => {
                this.columnTypes[i] = typeSelect.value;
                this.refreshLanguageSelects();
            });
            typeCell.appendChild(typeSelect);
            typeRow.appendChild(typeCell);

            let langCell: HTMLTableCellElement = document.createElement('td');
            this.constrainCellWidth(langCell);
            let langSelect: HTMLSelectElement = document.createElement('select');
            langSelect.id = 'lang_' + i;
            langSelect.className = 'table_select';
            langSelect.style.width = '100%';
            langSelect.disabled = true;
            langSelect.addEventListener('change', () => {
                this.columnLangs[i] = langSelect.value;
                this.refreshLanguageSelects();
            });
            langCell.appendChild(langSelect);
            langRow.appendChild(langCell);
        }

        if ((document.getElementById('hasHeaderRow') as HTMLInputElement).checked) {
            this.applyHeaderGuesses();
        } else {
            this.refreshLanguageSelects();
        }
    }

    applyHeaderGuesses(): void {
        let headerRow: string[] = this.rows[0] || [];
        for (let i = 0; i < this.columnTypes.length; i++) {
            let guess: { type: string, lang: string } = this.guessColumnMapping(headerRow[i] || '');
            this.columnTypes[i] = guess.type;
            this.columnLangs[i] = guess.lang;
            let typeSelect: HTMLSelectElement = document.getElementById('type_' + i) as HTMLSelectElement;
            typeSelect.value = guess.type;
        }
        this.refreshLanguageSelects();
    }

    guessColumnMapping(header: string): { type: string, lang: string } {
        let trimmed: string = header.trim();
        if (this.buildFieldRegex(this.headerPatterns.comment).test(trimmed)) {
            return { type: 'comment', lang: '' };
        }
        let termMatch: RegExpMatchArray | null = trimmed.match(this.buildFieldRegex(this.headerPatterns.term));
        if (termMatch) {
            let lang: string = this.findLanguageByDescription(termMatch[1]);
            if (lang) {
                return { type: 'term', lang: lang };
            }
        }
        let definitionMatch: RegExpMatchArray | null = trimmed.match(this.buildFieldRegex(this.headerPatterns.definition));
        if (definitionMatch) {
            let lang: string = this.findLanguageByDescription(definitionMatch[1]);
            if (lang) {
                return { type: 'definition', lang: lang };
            }
        }
        return { type: 'skip', lang: '' };
    }

    // Builds a case-insensitive matcher from a localized "column" template (e.g. "Term ({0})" or
    // "Término ({0})"), so header auto-detection works regardless of the app's UI language.
    buildFieldRegex(template: string): RegExp {
        let escaped: string = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let flexible: string = escaped.replace(/ /g, '\\s*');
        let pattern: string = flexible.replace('\\{0\\}', '(.+)');
        return new RegExp('^' + pattern + '$', 'i');
    }

    findLanguageByDescription(description: string): string {
        let normalized: string = description.trim().toLowerCase();
        let match: Pair | undefined = this.languages.find((lang: Pair) => lang.description.toLowerCase() === normalized);
        return match ? match.code : '';
    }

    refreshLanguageSelects(): void {
        let usedTermLangs: Set<string> = new Set();
        let usedDefinitionLangs: Set<string> = new Set();
        for (let i = 0; i < this.columnTypes.length; i++) {
            if (this.columnTypes[i] === 'term' && this.columnLangs[i]) {
                usedTermLangs.add(this.columnLangs[i]);
            }
            if (this.columnTypes[i] === 'definition' && this.columnLangs[i]) {
                usedDefinitionLangs.add(this.columnLangs[i]);
            }
        }

        for (let i = 0; i < this.columnTypes.length; i++) {
            let langSelect: HTMLSelectElement = document.getElementById('lang_' + i) as HTMLSelectElement;
            let type: string = this.columnTypes[i];
            if (type !== 'term' && type !== 'definition') {
                langSelect.innerHTML = '';
                langSelect.disabled = true;
                this.columnLangs[i] = '';
                continue;
            }

            let currentLang: string = this.columnLangs[i];
            let available: Pair[] = this.languages.filter((lang: Pair) => {
                if (lang.code === currentLang) {
                    return true;
                }
                if (type === 'term') {
                    return !usedTermLangs.has(lang.code);
                }
                return usedTermLangs.has(lang.code) && !usedDefinitionLangs.has(lang.code);
            });

            langSelect.disabled = available.length === 0;
            langSelect.innerHTML = '';
            for (let lang of available) {
                let option: HTMLOptionElement = document.createElement('option');
                option.value = lang.code;
                option.text = lang.description;
                langSelect.add(option);
            }
            if (!available.some((lang: Pair) => lang.code === currentLang)) {
                this.columnLangs[i] = available.length > 0 ? available[0].code : '';
            }
            langSelect.value = this.columnLangs[i];
        }
    }

    renderPreviewGrid(): void {
        let previewBody: HTMLTableSectionElement = document.getElementById('previewBody') as HTMLTableSectionElement;
        previewBody.innerHTML = '';
        for (let row of this.rows) {
            let tr: HTMLTableRowElement = document.createElement('tr');
            for (let cell of row) {
                let td: HTMLTableCellElement = document.createElement('td');
                td.innerText = cell;
                this.constrainCellWidth(td);
                tr.appendChild(td);
            }
            previewBody.appendChild(tr);
        }
    }

    constrainCellWidth(cell: HTMLTableCellElement): void {
        cell.style.minWidth = '140px';
        cell.style.maxWidth = '220px';
        cell.style.width = '140px';
        cell.style.whiteSpace = 'nowrap';
        cell.style.overflow = 'hidden';
        cell.style.textOverflow = 'ellipsis';
    }

    doImport(): void {
        if (!this.csvFile) {
            ipcRenderer.send('show-error', { group: 'importCsv', message: 'selectCsvFile' });
            return;
        }
        if (!this.consistent) {
            return;
        }
        let glossmlFile: string = (document.getElementById('glossmlFile') as HTMLInputElement).value;
        if (glossmlFile.trim() === '') {
            ipcRenderer.send('show-error', { group: 'importCsv', message: 'selectGlossmlFile' });
            return;
        }
        let sourceLanguage: string = (document.getElementById('sourceLanguage') as HTMLSelectElement).value;
        if (!this.columnTypes.includes('term')) {
            ipcRenderer.send('show-message', { group: 'importCsv', message: 'selectAtLeastOneTerm' });
            return;
        }
        if (this.columnTypes.filter((type: string) => type === 'comment').length > 1) {
            ipcRenderer.send('show-message', { group: 'importCsv', message: 'onlyOneComment' });
            return;
        }

        let columns: { action: string, lang?: string }[] = this.columnTypes.map((type: string, i: number) => {
            return (type === 'term' || type === 'definition') ? { action: type, lang: this.columnLangs[i] } : { action: type };
        });

        ipcRenderer.send('do-csv-import', {
            glossmlFile: glossmlFile,
            encoding: (document.getElementById('encodingSelect') as HTMLSelectElement).value,
            columnSeparator: this.getColumnSeparator(),
            textDelimiter: this.getTextDelimiter(),
            hasHeaderRow: (document.getElementById('hasHeaderRow') as HTMLInputElement).checked,
            sourceLanguage: sourceLanguage,
            columns: columns,
            openResult: (document.getElementById('openResult') as HTMLInputElement).checked
        });
    }
}
