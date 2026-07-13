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
import { Column } from './model/columnTypes.js';

export class Main {

    ROWSLOAD: number = 300;
    SAFETYROWS: number = 60;
    AVERAGE: number = 28;

    totalRows: number = 0;
    columns: Column[] = [];

    fetchingData: boolean = false;
    fetchingTop: boolean = false;
    fetchingBottom: boolean = false;
    checkingScroll: boolean = false;

    scrollToFirst: boolean = false;
    scrollToLast: boolean = false;

    currentEntryId: string = null;
    currentColIndex: number = -1;
    currentCell: HTMLTableCellElement = null;
    currentRow: HTMLTableRowElement = null;
    currentContent: string = null;

    autoSelect: { id: string, colIndex: number } | null = null;

    sortColIndex: number = -1;
    sortAscending: boolean = true;
    pendingMatchHighlight: { searchText: string, caseSensitive: boolean, useRegex: boolean } | null = null;
    lastMatchEnd: number = -1;

    mainContainer: HTMLDivElement;
    tbody: HTMLTableSectionElement;

    cellClickListener: (ev: MouseEvent) => void;
    cellKeyListener: (ev: KeyboardEvent) => void;
    fixedClickListener: (ev: MouseEvent) => void;

    constructor() {
        this.mainContainer = document.getElementById('mainContainer') as HTMLDivElement;
        this.tbody = document.getElementById('tableBody') as HTMLTableSectionElement;

        this.cellClickListener = (ev: MouseEvent) => { this.clickListener(ev); };
        this.cellKeyListener = (ev: KeyboardEvent) => { this.keyListener(ev); };
        this.fixedClickListener = (ev: MouseEvent) => { this.fixedListener(ev); };

        ipcRenderer.send('get-theme');
        ipcRenderer.on('set-theme', (event: IpcRendererEvent, theme: string) => {
            document.getElementById('theme')?.setAttribute('href', theme);
        });

        document.getElementById('newGlossary')?.addEventListener('click', () => {
            ipcRenderer.send('new-glossary');
        });
        document.getElementById('openGlossary')?.addEventListener('click', () => {
            ipcRenderer.send('open-glossary');
        });
        document.getElementById('saveGlossary')?.addEventListener('click', () => {
            ipcRenderer.send('save-glossary');
        });
        document.getElementById('fileProperties')?.addEventListener('click', () => {
            ipcRenderer.send('file-properties');
        });
        document.getElementById('replaceText')?.addEventListener('click', () => {
            ipcRenderer.send('replace-text-dialog');
        });
        document.getElementById('addRow')?.addEventListener('click', () => {
            this.addRow();
        });
        document.getElementById('removeRow')?.addEventListener('click', () => {
            this.deleteCurrentRow();
        });
        document.getElementById('addColumn')?.addEventListener('click', () => {
            ipcRenderer.send('add-column-dialog');
        });
        document.getElementById('removeColumn')?.addEventListener('click', () => {
            this.deleteCurrentColumn();
        });
        document.getElementById('termExtraction')?.addEventListener('click', () => {
            ipcRenderer.send('term-extraction');
        });
        document.getElementById('bilingualTermExtraction')?.addEventListener('click', () => {
            ipcRenderer.send('bilingual-term-extraction');
        });
        document.getElementById('exportTmx')?.addEventListener('click', () => {
            ipcRenderer.send('export-tmx');
        });
        document.getElementById('exportCsv')?.addEventListener('click', () => {
            ipcRenderer.send('export-csv');
        });
        document.getElementById('exportExcel')?.addEventListener('click', () => {
            ipcRenderer.send('export-excel');
        });
        document.getElementById('exportHtml')?.addEventListener('click', () => {
            ipcRenderer.send('export-html');
        });
        document.getElementById('exportTbx')?.addEventListener('click', () => {
            ipcRenderer.send('export-tbx');
        });
        document.getElementById('changeLanguages')?.addEventListener('click', () => {
            ipcRenderer.send('change-languages');
        });
        document.getElementById('userGuide')?.addEventListener('click', () => {
            ipcRenderer.send('user-guide');
        });
        ipcRenderer.on('set-columns', (event: IpcRendererEvent, columns: Column[]) => {
            this.columns = columns;
            this.drawColumns();
            let count: number = this.ROWSLOAD > this.totalRows ? this.totalRows : this.ROWSLOAD;
            this.getRows(0, count, false);
        });
        ipcRenderer.on('set-file-info', (event: IpcRendererEvent, data: { totalRows: number, columns: Column[] }) => {
            this.setFileInfo(data);
        });
        ipcRenderer.on('set-rows', (event: IpcRendererEvent, data: any) => {
            this.setRows(data);
        });
        ipcRenderer.on('set-status', (event: IpcRendererEvent, status: string) => {
            this.setStatus(status);
        });
        ipcRenderer.on('row-added', (event: IpcRendererEvent, data: { totalRows: number, entryId: number, colIndex: number, row: number }) => {
            this.rowAdded(data);
        });
        ipcRenderer.on('add-row-request', () => {
            this.addRow();
        });
        ipcRenderer.on('set-sort', (event: IpcRendererEvent, data: { colIndex: number, ascending: boolean }) => {
            this.sortColIndex = data.colIndex;
            this.sortAscending = data.ascending;
            this.applySortIndicator();
        });
        ipcRenderer.on('delete-row', () => {
            this.deleteCurrentRow();
        });
        ipcRenderer.on('delete-column', () => {
            this.deleteCurrentColumn();
        });
        ipcRenderer.on('get-search-start', (event: IpcRendererEvent, args: { searchText: string, caseSensitive: boolean, useRegex: boolean }) => {
            if (this.continueMatchInCurrentCell(args)) {
                ipcRenderer.send('match-found-notification', true);
                return;
            }
            let row: number = 0;
            let currentRowElement: HTMLTableRowElement | null = this.currentEntryId ? document.getElementById(this.currentEntryId) as HTMLTableRowElement : null;
            if (currentRowElement) {
                row = Number.parseInt(currentRowElement.getAttribute('data-row') || '0');
            }
            let column: number = this.currentColIndex >= 0 ? this.currentColIndex : 0;
            ipcRenderer.send('search-start', { searchText: args.searchText, caseSensitive: args.caseSensitive, useRegex: args.useRegex, row: row, column: column });
        });
        ipcRenderer.on('select-match', (event: IpcRendererEvent, data: { entryId: number, row: number, column: number, searchText: string, caseSensitive: boolean, useRegex: boolean }) => {
            this.selectMatch(data);
        });
        ipcRenderer.on('replace-selected-text', (event: IpcRendererEvent, replaceText: string) => {
            this.replaceSelectedText(replaceText);
        });

        this.resizePanel();
        window.addEventListener('resize', () => {
            this.resizePanel();
        });

        this.mainContainer.addEventListener('scroll', (e: Event) => {
            this.checkScroll(e);
        });
        this.mainContainer.addEventListener('scrollend', (e: Event) => {
            this.checkScrollend(e);
        });
        this.mainContainer.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
                e.preventDefault();
                this.scrollToLast = true;
                this.getRows(this.totalRows - this.ROWSLOAD, this.ROWSLOAD, true);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
                e.preventDefault();
                this.scrollToFirst = true;
                this.getRows(0, this.ROWSLOAD, true);
            }
        });
    }

    setFileInfo(data: { totalRows: number, columns: Column[] }): void {
        this.totalRows = data.totalRows;
        this.columns = data.columns;
        this.currentEntryId = null;
        this.currentColIndex = -1;
        this.currentCell = null;
        this.currentContent = null;
        this.currentRow = null;

        let mainTable: HTMLTableElement = document.getElementById('main') as HTMLTableElement;
        let thead: HTMLTableSectionElement = mainTable.tHead;
        thead.innerHTML = '';
        let headerRow: HTMLTableRowElement = thead.insertRow();
        headerRow.id = 'headerRow';
        this.drawColumns();
        this.tbody.innerHTML = '';
        this.mainContainer.scrollTop = 0;
        this.resizePanel();

        let count: number = this.ROWSLOAD > this.totalRows ? this.totalRows : this.ROWSLOAD;
        this.getRows(0, count, false);
    }

    drawColumns(): void {
        let tableHead: HTMLTableRowElement = document.getElementById('headerRow') as HTMLTableRowElement;
        tableHead.innerHTML = '';
        let th: HTMLTableCellElement = document.createElement('th');
        th.innerText = '#';
        th.id = 'header-file-order';
        th.classList.add('noWrap', 'sortable');
        th.style.minWidth = '20px';
        th.addEventListener('click', () => {
            this.saveEdit();
            this.scrollToFirst = true;
            ipcRenderer.send('sort-column', { colIndex: -1 });
        });
        tableHead.appendChild(th);
        for (let i = 0; i < this.columns.length; i++) {
            let column: Column = this.columns[i];
            let colTh: HTMLTableCellElement = document.createElement('th');
            colTh.innerText = column.description;
            colTh.id = 'header-' + i;
            colTh.classList.add('noWrap', 'sortable');
            colTh.style.minWidth = '200px';
            colTh.style.textAlign = 'left';
            colTh.addEventListener('click', () => {
                this.saveEdit();
                this.scrollToFirst = true;
                ipcRenderer.send('sort-column', { colIndex: i });
            });
            tableHead.appendChild(colTh);
        }
        this.applySortIndicator();
    }

    applySortIndicator(): void {
        let headers: HTMLCollectionOf<Element> = document.getElementsByClassName('sortable');
        for (let header of headers) {
            header.classList.remove('arrow-up', 'arrow-down');
        }
        if (this.sortColIndex < 0) {
            return;
        }
        let header: HTMLElement | null = document.getElementById('header-' + this.sortColIndex);
        header?.classList.add(this.sortAscending ? 'arrow-up' : 'arrow-down');
    }

    resizePanel(): void {
        let topBar: HTMLDivElement = document.getElementById('topBar') as HTMLDivElement;
        this.mainContainer.style.height = (window.innerHeight - topBar.offsetHeight) + 'px';
    }

    getRows(start: number, count: number, scroll: boolean): void {
        ipcRenderer.send('get-rows', { start: start, count: count, scroll: scroll });
    }

    setRows(data: any): void {
        if (this.fetchingTop) {
            this.setTopRows(data);
            return;
        }
        if (this.fetchingBottom) {
            this.setBottomRows(data);
            return;
        }

        let rows: string[] = data.rows;
        let length: number = rows.length;

        let html: string = '';
        for (let i = 0; i < length; i++) {
            html = html + rows[i];
        }
        this.tbody.innerHTML = html;

        this.totalRows = data.totalRows;

        let loadHeight: number = this.tbody.clientHeight;
        if (length > 0) {
            this.AVERAGE = loadHeight / length;
        }

        let totalHeight: number = this.AVERAGE * this.totalRows;
        let topHeight: number = data.start * this.AVERAGE;
        let bottomHeight: number = totalHeight - topHeight - loadHeight;

        let fillerTop: HTMLTableRowElement = document.createElement('tr');
        fillerTop.id = 'fillerTop';
        fillerTop.style.height = topHeight > 0 ? topHeight + 'px' : '0px';

        let fillerBottom: HTMLTableRowElement = document.createElement('tr');
        fillerBottom.id = 'fillerBottom';
        fillerBottom.style.height = bottomHeight > 0 ? bottomHeight + 'px' : '0px';

        this.tbody.prepend(fillerTop);
        this.tbody.appendChild(fillerBottom);

        this.attachListeners();

        if (this.autoSelect) {
            this.selectCell(this.autoSelect.id, this.autoSelect.colIndex);
            this.autoSelect = null;
        }

        let firstRow: number = data.start;
        let lastRow: number = data.start + length - 1;

        setTimeout(() => {
            if (this.scrollToLast && data.scroll) {
                this.mainContainer.scrollTop = this.mainContainer.scrollHeight;
                this.scrollToLast = false;
            } else if (this.scrollToFirst && data.scroll) {
                this.mainContainer.scrollTop = 0;
                this.scrollToFirst = false;
            } else if (firstRow === 0 && data.scroll) {
                this.mainContainer.scrollTop = 0;
            } else if (lastRow >= this.totalRows - 1 && data.scroll) {
                this.mainContainer.scrollTop = this.mainContainer.scrollHeight;
            } else if (data.scroll) {
                this.mainContainer.scrollTop = topHeight + loadHeight / 2 - this.mainContainer.clientHeight / 2;
            }
            this.fetchingData = false;
            document.body.style.cursor = 'default';
            this.checkingScroll = false;
        }, 500);
    }

    setTopRows(data: any): void {
        let trs: HTMLCollectionOf<HTMLTableRowElement> = this.tbody.getElementsByTagName('tr');
        let array: HTMLTableRowElement[] = Array.from(trs);

        let rows: string[] = data.rows;
        let length: number = rows.length;

        let removedHeight: number = 0;
        for (let i = array.length - 2 - length; i < array.length - 1; i++) {
            removedHeight += array[i].clientHeight + 4;
        }

        let holder: HTMLTableSectionElement = document.createElement('tbody');
        let html: string = '';
        for (let i = 0; i < length; i++) {
            html = html + rows[i];
        }
        holder.innerHTML = html;
        let addedRows: HTMLTableRowElement[] = Array.from(holder.getElementsByTagName('tr'));

        array.splice(1, 0, ...addedRows);
        array.splice(array.length - 1 - addedRows.length, addedRows.length);

        html = '';
        for (let i = 0; i < array.length; i++) {
            html = html + array[i].outerHTML;
        }
        this.tbody.innerHTML = html;

        let realHeight: number = 0;
        let tableRows: HTMLCollectionOf<HTMLTableRowElement> = this.tbody.getElementsByTagName('tr');
        for (let i = 1; i < array.length - 1; i++) {
            realHeight += tableRows[i].clientHeight + 4;
        }

        let addedHeight: number = 0;
        for (let i = 0; i < addedRows.length; i++) {
            addedHeight += tableRows[i + 1].clientHeight + 4;
        }

        this.AVERAGE = realHeight / (array.length - 2);

        let fillerTop: HTMLTableRowElement = document.getElementById('fillerTop') as HTMLTableRowElement;
        let fillerBottom: HTMLTableRowElement = document.getElementById('fillerBottom') as HTMLTableRowElement;
        let topHeight: number = fillerTop.clientHeight - addedHeight;
        let bottomHeight: number = fillerBottom.clientHeight + removedHeight;

        let firstRow: number = Number.parseInt(tableRows[1].getAttribute('data-row') || '0');
        let lastRow: number = Number.parseInt(tableRows[tableRows.length - 2].getAttribute('data-row') || '0');

        fillerTop.style.height = (firstRow === 0 ? 0 : topHeight) + 'px';
        fillerBottom.style.height = (lastRow >= this.totalRows - 1 ? 0 : bottomHeight) + 'px';

        if (firstRow === 0) {
            this.mainContainer.scrollTop = 0;
        }

        this.attachListeners();

        if (this.autoSelect) {
            this.selectCell(this.autoSelect.id, this.autoSelect.colIndex);
            this.autoSelect = null;
        }

        this.fetchingTop = false;
        document.body.style.cursor = 'default';
        this.checkingScroll = false;
    }

    setBottomRows(data: any): void {
        let trs: HTMLCollectionOf<HTMLTableRowElement> = this.tbody.getElementsByTagName('tr');
        let array: HTMLTableRowElement[] = Array.from(trs);

        let rows: string[] = data.rows;
        let length: number = rows.length;

        let removedHeight: number = 0;
        for (let i = 1; i <= length; i++) {
            removedHeight += array[i].clientHeight + 4;
        }

        let holder: HTMLTableSectionElement = document.createElement('tbody');
        let html: string = '';
        for (let i = 0; i < length; i++) {
            html = html + rows[i];
        }
        holder.innerHTML = html;
        let addedRows: HTMLTableRowElement[] = Array.from(holder.getElementsByTagName('tr'));

        array.splice(array.length - 1, 0, ...addedRows);
        array.splice(1, addedRows.length);

        html = '';
        for (let i = 0; i < array.length; i++) {
            html = html + array[i].outerHTML;
        }
        this.tbody.innerHTML = html;

        let realHeight: number = 0;
        let tableRows: HTMLCollectionOf<HTMLTableRowElement> = this.tbody.getElementsByTagName('tr');
        for (let i = 1; i < array.length - 1; i++) {
            realHeight += tableRows[i].clientHeight + 4;
        }

        let addedHeight: number = 0;
        for (let i = array.length - 1 - addedRows.length; i < array.length - 1; i++) {
            addedHeight += tableRows[i].clientHeight + 4;
        }

        this.AVERAGE = realHeight / (array.length - 2);

        let fillerTop: HTMLTableRowElement = document.getElementById('fillerTop') as HTMLTableRowElement;
        let fillerBottom: HTMLTableRowElement = document.getElementById('fillerBottom') as HTMLTableRowElement;
        let topHeight: number = fillerTop.clientHeight + removedHeight;
        let bottomHeight: number = fillerBottom.clientHeight - addedHeight;

        let firstRow: number = Number.parseInt(tableRows[1].getAttribute('data-row') || '0');
        let lastRow: number = Number.parseInt(tableRows[tableRows.length - 2].getAttribute('data-row') || '0');

        fillerTop.style.height = (firstRow === 0 ? 0 : topHeight) + 'px';
        fillerBottom.style.height = (lastRow >= this.totalRows - 1 ? 0 : bottomHeight) + 'px';

        this.attachListeners();

        if (this.autoSelect) {
            this.selectCell(this.autoSelect.id, this.autoSelect.colIndex);
            this.autoSelect = null;
        }

        this.fetchingBottom = false;
        document.body.style.cursor = 'default';
        this.checkingScroll = false;
    }

    addRow(): void {
        this.saveEdit();
        let afterEntryId: string | null = this.currentEntryId;
        let colIndex: number = this.currentColIndex >= 0 ? this.currentColIndex : 0;
        this.scrollToLast = !afterEntryId;
        ipcRenderer.send('add-row', { afterEntryId: afterEntryId, colIndex: colIndex });
    }

    rowAdded(data: { totalRows: number, entryId: number, colIndex: number, row: number }): void {
        this.totalRows = data.totalRows;
        this.autoSelect = { id: '' + data.entryId, colIndex: data.colIndex };
        this.fetchingData = true;
        document.body.style.cursor = 'wait';
        let start: number = Math.max(0, data.row - Math.floor(this.ROWSLOAD / 2));
        let count: number = this.ROWSLOAD;
        if (start + count >= this.totalRows) {
            start = Math.max(0, this.totalRows - this.ROWSLOAD);
            count = this.totalRows - start;
        }
        this.getRows(start, count, true);
    }

    selectMatch(data: { entryId: number, row: number, column: number, searchText: string, caseSensitive: boolean, useRegex: boolean }): void {
        if (this.currentCell?.isContentEditable) {
            this.saveEdit();
        }
        this.pendingMatchHighlight = { searchText: data.searchText, caseSensitive: data.caseSensitive, useRegex: data.useRegex };
        let id: string = '' + data.entryId;
        if (document.getElementById(id)) {
            this.selectCell(id, data.column);
            return;
        }
        this.autoSelect = { id: id, colIndex: data.column };
        this.fetchingData = true;
        document.body.style.cursor = 'wait';
        let start: number = Math.max(0, data.row - Math.floor(this.ROWSLOAD / 2));
        let count: number = this.ROWSLOAD;
        if (start + count >= this.totalRows) {
            start = Math.max(0, this.totalRows - this.ROWSLOAD);
            count = this.totalRows - start;
        }
        this.getRows(start, count, true);
    }

    private findMatchInText(text: string, fromIndex: number, args: { searchText: string, caseSensitive: boolean, useRegex: boolean }): { start: number, end: number } | null {
        let pattern: string = args.useRegex ? args.searchText : args.searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let regex: RegExp;
        try {
            regex = new RegExp(pattern, args.caseSensitive ? '' : 'i');
        } catch (error) {
            return null;
        }
        let result: RegExpMatchArray | null = text.substring(fromIndex).match(regex);
        if (!result || result.index === undefined) {
            return null;
        }
        let start: number = fromIndex + result.index;
        return { start: start, end: start + result[0].length };
    }

    private applyHighlight(cell: HTMLTableCellElement, start: number, end: number): void {
        let textNode: ChildNode | null = cell.firstChild;
        if (!textNode) {
            return;
        }
        let range: Range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        let selection: Selection | null = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
        this.lastMatchEnd = end;
    }

    private continueMatchInCurrentCell(args: { searchText: string, caseSensitive: boolean, useRegex: boolean }): boolean {
        if (!this.currentEntryId || this.currentColIndex < 0 || this.lastMatchEnd < 0) {
            return false;
        }
        let row: HTMLTableRowElement | null = document.getElementById(this.currentEntryId) as HTMLTableRowElement;
        if (!row) {
            return false;
        }
        let cell: HTMLTableCellElement | null = null;
        for (let candidate of Array.from(row.getElementsByTagName('td'))) {
            if (candidate.getAttribute('data-col') === '' + this.currentColIndex) {
                cell = candidate;
                break;
            }
        }
        if (!cell) {
            return false;
        }
        let match: { start: number, end: number } | null = this.findMatchInText(cell.textContent || '', this.lastMatchEnd, args);
        if (!match) {
            return false;
        }
        if (this.currentCell !== cell) {
            if (this.currentCell?.isContentEditable) {
                this.saveEdit();
            }
            this.activateCell(row, cell, this.currentEntryId, this.currentColIndex);
        }
        this.applyHighlight(cell, match.start, match.end);
        return true;
    }

    private activateCell(row: HTMLTableRowElement, cell: HTMLTableCellElement, id: string, colIndex: number): void {
        this.currentRow = row;
        this.currentRow.classList.add('currentRow');
        this.currentEntryId = id;
        this.currentColIndex = colIndex;
        this.currentCell = cell;
        this.currentContent = cell.innerHTML;
        cell.contentEditable = 'true';
        cell.classList.add('editing');
        cell.focus();
    }

    replaceSelectedText(replaceText: string): void {
        if (!this.currentCell?.isContentEditable) {
            return;
        }
        let selection: Selection | null = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return;
        }
        let range: Range = selection.getRangeAt(0);
        let originalLength: number = range.toString().length;
        range.deleteContents();
        range.insertNode(document.createTextNode(replaceText));
        selection.removeAllRanges();
        this.currentCell.normalize();
        this.lastMatchEnd = this.lastMatchEnd - originalLength + replaceText.length;
        this.saveEdit();
    }

    deleteCurrentRow(): void {
        if (this.currentEntryId) {
            this.saveEdit();
            let tableRows: HTMLCollectionOf<HTMLTableRowElement> = this.tbody.getElementsByTagName('tr');
            let start: number = tableRows.length > 1 ? Number.parseInt(tableRows[1].getAttribute('data-row') || '0') : 0;
            ipcRenderer.send('remove-row', { entryId: Number.parseInt(this.currentEntryId), start: start });
        }
    }

    deleteCurrentColumn(): void {
        if (this.currentColIndex >= 0) {
            this.saveEdit();
            ipcRenderer.send('remove-column', this.currentColIndex);
        }
    }

    attachListeners(): void {
        let cells: HTMLCollectionOf<Element> = document.getElementsByClassName('cell');
        for (let cell of cells) {
            cell.addEventListener('click', this.cellClickListener);
            cell.addEventListener('keydown', this.cellKeyListener);
        }
        let fixed: HTMLCollectionOf<Element> = document.getElementsByClassName('fixed');
        for (let cell of fixed) {
            cell.addEventListener('click', this.fixedClickListener);
        }
        this.mainContainer.focus();
    }

    clickListener(event: MouseEvent): void {
        let element: HTMLTableCellElement = event.target as HTMLTableCellElement;
        let row: HTMLTableRowElement = element.parentElement as HTMLTableRowElement;
        let id: string = row.id;
        let colIndexStr: string | null = element.getAttribute('data-col');
        if (!id || colIndexStr === null) {
            return;
        }
        let colIndex: number = Number.parseInt(colIndexStr);

        if (this.currentCell !== null && this.currentCell.isContentEditable
            && this.currentEntryId === id && this.currentColIndex === colIndex) {
            return;
        }
        if (this.currentCell !== null && this.currentCell.isContentEditable) {
            this.saveEdit();
        }

        this.currentEntryId = id;
        this.currentColIndex = colIndex;
        this.currentCell = element;
        this.currentContent = this.currentCell.innerHTML;
        this.currentCell.contentEditable = 'true';
        this.currentCell.classList.add('editing');
        this.currentRow = row;
        this.currentRow.classList.add('currentRow');
        this.currentCell.focus();
    }

    fixedListener(event: MouseEvent): void {
        if (this.currentCell?.isContentEditable) {
            this.saveEdit();
        }
        let element: HTMLTableCellElement = event.target as HTMLTableCellElement;
        let row: HTMLTableRowElement = element.parentElement as HTMLTableRowElement;
        let id: string = row.id;
        if (id && id !== 'fillerTop' && id !== 'fillerBottom') {
            this.currentEntryId = id;
            this.currentRow = row;
            if (this.currentCell !== null) {
                this.currentCell.innerHTML = this.currentContent;
                this.currentCell.contentEditable = 'false';
                this.currentCell.classList.remove('editing');
                this.currentCell = null;
                this.currentContent = null;
                this.currentRow.classList.remove('currentRow');
                this.currentRow = null;
            }
        }
    }

    keyListener(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.cancelEdit();
            event.preventDefault();
            event.stopPropagation();
        }
        if (event.key === 'Tab') {
            this.saveEdit();
            event.preventDefault();
        }
    }

    saveEdit(): void {
        if (this.currentCell?.isContentEditable) {
            if (this.currentContent !== this.currentCell.innerHTML) {
                ipcRenderer.send('save-data', {
                    entryId: Number.parseInt(this.currentEntryId),
                    colIndex: this.currentColIndex,
                    value: this.currentCell.innerText
                });
                this.currentContent = this.currentCell.innerHTML;
            }
            this.currentCell.contentEditable = 'false';
            this.currentCell.classList.remove('editing');
            this.currentCell = null;
            this.currentRow?.classList.remove('currentRow');
            this.currentRow = null;
        }
    }

    cancelEdit(): void {
        if (this.currentCell) {
            this.currentCell.innerHTML = this.currentContent;
            this.currentCell.contentEditable = 'false';
            this.currentCell.classList.remove('editing');
            this.currentCell = null;
            this.currentContent = null;
            this.currentRow.classList.remove('currentRow');
            this.currentRow = null;
            this.currentEntryId = null;
            this.currentColIndex = -1;
        }
    }

    selectCell(id: string, colIndex: number): void {
        let row: HTMLTableRowElement = document.getElementById(id) as HTMLTableRowElement;
        if (!row) {
            return;
        }
        let cells: HTMLCollectionOf<HTMLTableCellElement> = row.getElementsByTagName('td');
        for (let cell of cells) {
            if (cell.getAttribute('data-col') === '' + colIndex) {
                this.activateCell(row, cell, id, colIndex);
                if (this.pendingMatchHighlight) {
                    let match: { start: number, end: number } | null = this.findMatchInText(cell.textContent || '', 0, this.pendingMatchHighlight);
                    if (match) {
                        this.applyHighlight(cell, match.start, match.end);
                    }
                    this.pendingMatchHighlight = null;
                }
                break;
            }
        }
    }

    checkScroll(e: Event): void {
        if (this.fetchingData || this.fetchingBottom || this.fetchingTop || this.checkingScroll) {
            e.preventDefault();
        }
    }

    checkScrollend(e: Event): void {
        if (this.fetchingData || this.fetchingBottom || this.fetchingTop) {
            e.preventDefault();
            return;
        }

        this.checkingScroll = true;
        e.preventDefault();

        let tableRows: HTMLCollectionOf<HTMLTableRowElement> = this.tbody.getElementsByTagName('tr');
        if (tableRows.length < 3) {
            this.checkingScroll = false;
            return;
        }

        let firstRow: number = Number.parseInt(tableRows[1].getAttribute('data-row') || '0');
        let lastRow: number = Number.parseInt(tableRows[tableRows.length - 2].getAttribute('data-row') || '0');

        let fillerTop: HTMLTableRowElement = document.getElementById('fillerTop') as HTMLTableRowElement;
        let fillerBottom: HTMLTableRowElement = document.getElementById('fillerBottom') as HTMLTableRowElement;
        let topHeight: number = fillerTop.clientHeight;
        let bottomHeight: number = fillerBottom.clientHeight;
        let contentHeight: number = this.tbody.clientHeight - topHeight - bottomHeight;
        let tableBottom: number = topHeight + contentHeight;

        let safetyHeight: number = this.SAFETYROWS * this.AVERAGE;
        let mainScroll: number = this.mainContainer.scrollTop;

        if (mainScroll <= 1 && firstRow > 0) {
            this.scrollToFirst = true;
            this.fetchingData = true;
            document.body.style.cursor = 'wait';
            this.getRows(0, this.ROWSLOAD, true);
            return;
        }
        if (mainScroll >= this.mainContainer.scrollHeight - this.mainContainer.clientHeight - 2 && lastRow < this.totalRows - 1) {
            this.scrollToLast = true;
            this.fetchingData = true;
            document.body.style.cursor = 'wait';
            let start: number = Math.max(0, this.totalRows - this.ROWSLOAD);
            this.getRows(start, this.totalRows - start, true);
            return;
        }

        let scrollRow: number = Math.floor(mainScroll / this.AVERAGE);
        if (scrollRow >= this.totalRows - 1) {
            scrollRow = this.totalRows - 1;
        }

        if (mainScroll < topHeight || mainScroll > tableBottom) {
            this.fetchingData = true;
            document.body.style.cursor = 'wait';
            let start: number = scrollRow - Math.floor(this.ROWSLOAD / 2);
            if (start < 0) {
                start = 0;
            }
            let count: number = this.ROWSLOAD;
            if (start + count >= this.totalRows) {
                start = this.totalRows - this.ROWSLOAD;
                if (start < 0) { start = 0; }
                count = this.totalRows - start;
            }
            this.getRows(start, count, true);
            return;
        }

        if (mainScroll > topHeight && mainScroll < topHeight + safetyHeight && mainScroll > safetyHeight) {
            if (firstRow === 0) {
                this.checkingScroll = false;
                return;
            }
            this.fetchingTop = true;
            document.body.style.cursor = 'wait';
            let start: number = firstRow - 1 - this.SAFETYROWS;
            let count: number = this.SAFETYROWS;
            if (start < 0) {
                start = 0;
                count = firstRow - 1;
            }
            this.getRows(start, count, true);
            return;
        }

        if (mainScroll > tableBottom - safetyHeight && mainScroll < tableBottom) {
            if (lastRow >= this.totalRows - 1) {
                this.checkingScroll = false;
                return;
            }
            this.fetchingBottom = true;
            document.body.style.cursor = 'wait';
            let start: number = lastRow + 1;
            let count: number = this.SAFETYROWS;
            if (this.totalRows - (start + count) < this.SAFETYROWS) {
                count = this.totalRows - start;
            }
            this.getRows(start, count, true);
            return;
        }

        this.checkingScroll = false;
    }

    setStatus(status: string): void {
        let statusBar: HTMLDivElement = document.getElementById('status') as HTMLDivElement;
        statusBar.innerText = status;
        statusBar.style.display = status === '' ? 'none' : 'block';
        document.body.style.cursor = status === '' ? 'default' : 'wait';
    }
}

