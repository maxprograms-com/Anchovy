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
import { CellValue, ColumnUtils } from 'typesexcel';
import { Pair } from './pair.js';

const PREVIEW_ROWS: number = 6;

export class ImportExcel {

    sheets: { name: string, rows: CellValue[][] }[] = [];
    languages: Pair[] = [];
    columnTypes: string[] = [];
    columnLangs: string[] = [];
    anyLanguageLabel: string = '';
    columnUtils: ColumnUtils = new ColumnUtils();
    typeLabels: { skip: string, comment: string, term: string, definition: string } = { skip: 'Skip', comment: 'Comment', term: 'Term', definition: 'Definition' };
    headerPatterns: { comment: string, term: string, definition: string } = { comment: 'Comment', term: 'Term ({0})', definition: 'Definition ({0})' };

    constructor() {
        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });
        ipcRenderer.on('set-import-data', (event: IpcRendererEvent, data: { anyLanguageLabel: string, typeLabels: { skip: string, comment: string, term: string, definition: string }, headerPatterns: { comment: string, term: string, definition: string } }) => {
            this.anyLanguageLabel = data.anyLanguageLabel;
            this.typeLabels = data.typeLabels;
            this.headerPatterns = data.headerPatterns;
            this.populateSourceLanguage();
        });
        document.getElementById('browseExcel')?.addEventListener('click', () => {
            ipcRenderer.send('browse-excel-source');
        });
        ipcRenderer.on('set-excel-source', (event: IpcRendererEvent, data: { sourceFile: string, sheets: { name: string, rows: CellValue[][] }[] }) => {
            this.sheets = data.sheets;
            (document.getElementById('excelFile') as HTMLInputElement).value = data.sourceFile;
            let glossmlField: HTMLInputElement = document.getElementById('glossmlFile') as HTMLInputElement;
            if (glossmlField.value.trim() === '') {
                glossmlField.value = data.sourceFile.replace(/\.[^/.]+$/, '.gls');
            }
            this.tryInitialRender();
        });
        document.getElementById('browseGlossml')?.addEventListener('click', () => {
            ipcRenderer.send('browse-excel-glossml-target', (document.getElementById('glossmlFile') as HTMLInputElement).value);
        });
        ipcRenderer.on('set-glossml-target', (event: IpcRendererEvent, filePath: string) => {
            (document.getElementById('glossmlFile') as HTMLInputElement).value = filePath;
        });
        ipcRenderer.send('get-languages');
        ipcRenderer.on('set-languages', (event: IpcRendererEvent, languages: Pair[]) => {
            this.languages = languages.filter((lang: Pair) => lang.code !== 'none');
            this.populateSourceLanguage();
            this.tryInitialRender();
        });
        (document.getElementById('sheetSelect') as HTMLSelectElement).addEventListener('change', () => {
            this.selectSheet();
        });
        (document.getElementById('hasHeaderRow') as HTMLInputElement).addEventListener('change', () => {
            let sheetIndex: number = (document.getElementById('sheetSelect') as HTMLSelectElement).selectedIndex;
            if (this.sheets[sheetIndex] && (document.getElementById('hasHeaderRow') as HTMLInputElement).checked) {
                this.applyHeaderGuesses(sheetIndex);
            }
        });
        (document.getElementById('importButton') as HTMLButtonElement).addEventListener('click', () => {
            this.doImport();
        });
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Escape') {
                ipcRenderer.send('close-importExcel');
            }
        });
        setTimeout(() => {
            this.sendHeight();
        }, 100);
    }

    tryInitialRender(): void {
        if (this.sheets.length === 0 || this.languages.length === 0) {
            return;
        }
        let sheetSelect: HTMLSelectElement = document.getElementById('sheetSelect') as HTMLSelectElement;
        sheetSelect.innerHTML = '';
        for (let i = 0; i < this.sheets.length; i++) {
            let option: HTMLOptionElement = document.createElement('option');
            option.value = '' + i;
            option.text = this.sheets[i].name;
            sheetSelect.add(option);
        }
        this.selectSheet();
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

    selectSheet(): void {
        let sheetSelect: HTMLSelectElement = document.getElementById('sheetSelect') as HTMLSelectElement;
        let sheetIndex: number = sheetSelect.selectedIndex;
        this.renderMapping(sheetIndex);
        this.renderPreview(sheetIndex);
        this.sendHeight();
    }

    sendHeight(): void {
        ipcRenderer.send('set-height', { window: 'importExcel', width: document.body.clientWidth, height: document.body.clientHeight });
    }

    renderMapping(sheetIndex: number): void {
        let columnCount: number = this.sheets[sheetIndex].rows[0]?.length || 0;
        this.columnTypes = new Array(columnCount).fill('skip');
        this.columnLangs = new Array(columnCount).fill('');

        let headerRow: HTMLTableRowElement = document.getElementById('columnHeaderRow') as HTMLTableRowElement;
        let typeRow: HTMLTableRowElement = document.getElementById('typeRow') as HTMLTableRowElement;
        let langRow: HTMLTableRowElement = document.getElementById('langRow') as HTMLTableRowElement;
        headerRow.innerHTML = '';
        typeRow.innerHTML = '';
        langRow.innerHTML = '';

        for (let i = 0; i < columnCount; i++) {
            let th: HTMLTableCellElement = document.createElement('th');
            th.innerText = this.columnUtils.columnName(i);
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
            this.applyHeaderGuesses(sheetIndex);
        } else {
            this.refreshLanguageSelects();
        }
    }

    applyHeaderGuesses(sheetIndex: number): void {
        let headerRow: CellValue[] = this.sheets[sheetIndex].rows[0] || [];
        for (let i = 0; i < this.columnTypes.length; i++) {
            let guess: { type: string, lang: string } = this.guessColumnMapping(this.cellToString(headerRow[i]));
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

    renderPreview(sheetIndex: number): void {
        let previewBody: HTMLTableSectionElement = document.getElementById('previewBody') as HTMLTableSectionElement;
        previewBody.innerHTML = '';
        let rows: CellValue[][] = this.sheets[sheetIndex].rows.slice(0, PREVIEW_ROWS);
        for (let row of rows) {
            let tr: HTMLTableRowElement = document.createElement('tr');
            for (let cell of row) {
                let td: HTMLTableCellElement = document.createElement('td');
                td.innerText = this.cellToString(cell);
                this.constrainCellWidth(td);
                tr.appendChild(td);
            }
            previewBody.appendChild(tr);
        }
    }

    cellToString(value: CellValue): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (value instanceof Date) {
            return value.toLocaleDateString();
        }
        return '' + value;
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
        if (this.sheets.length === 0) {
            ipcRenderer.send('show-error', { group: 'importExcel', message: 'selectExcelFile' });
            return;
        }
        let glossmlFile: string = (document.getElementById('glossmlFile') as HTMLInputElement).value;
        if (glossmlFile.trim() === '') {
            ipcRenderer.send('show-error', { group: 'importExcel', message: 'selectGlossmlFile' });
            return;
        }
        let sourceLanguage: string = (document.getElementById('sourceLanguage') as HTMLSelectElement).value;
        if (!this.columnTypes.includes('term')) {
            ipcRenderer.send('show-message', { group: 'importExcel', message: 'selectAtLeastOneTerm' });
            return;
        }
        if (this.columnTypes.filter((type: string) => type === 'comment').length > 1) {
            ipcRenderer.send('show-message', { group: 'importExcel', message: 'onlyOneComment' });
            return;
        }

        let columns: { action: string, lang?: string }[] = this.columnTypes.map((type: string, i: number) => {
            return (type === 'term' || type === 'definition') ? { action: type, lang: this.columnLangs[i] } : { action: type };
        });

        ipcRenderer.send('do-excel-import', {
            glossmlFile: glossmlFile,
            sheetIndex: (document.getElementById('sheetSelect') as HTMLSelectElement).selectedIndex,
            hasHeaderRow: (document.getElementById('hasHeaderRow') as HTMLInputElement).checked,
            sourceLanguage: sourceLanguage,
            columns: columns,
            openResult: (document.getElementById('openResult') as HTMLInputElement).checked
        });
    }
}
